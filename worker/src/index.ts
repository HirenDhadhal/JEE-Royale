import express from 'express';
import cors from 'cors';
import { createClient } from 'redis';
import { connectToRedis, leaguesRanges } from './utils/utils';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());
app.use(cors());
const redisClient = createClient();
connectToRedis(redisClient);

// 6. HAVE the test created in background by choosing random 30 questions
// 7. When we hit 100 users or 60 second timeout with some players in a test_id, we add the test_id in redis queue for all those user_id.
const MATCH_SIZE = 100;
const LEAGUE_EXPPAND_1_MS = 20 * 1000;
const LEAGUE_EXPAND_2_MS = 40 * 1000;
const MATCH_TIMEOUT_MS = 60 * 1000;

// Key | Type | Description
// matchmaking:<leagueName> | ZSET  | Queue of users by rating
// user_status:<userId>     | Hash  | Stores user's match status and matchId
// active_matches           | ZSET  | All active matches, scored by createdAt
// match:<matchId>          | Hash  | Metadata like leagueName, createdAt
// match:<matchId>:users    | Set   | List of userIds in the match

async function runMatchMakingWorker() {
  for (let i = 0; i < leaguesRanges.length; i++) {
    const now = Date.now();
    let leagueName = leaguesRanges[i].name;
    let league_minRating = leaguesRanges[i].min;
    let league_maxRating = leaguesRanges[i].max;
    let EXPAND_DELTA = 200;

    //check for users in matchmaking queue searching for a test
    //TODO - Try to sort users by the time present in Queue [take ones who waited more first]
    const currentLeague_users = await redisClient.zRangeByScore(
      `matchmaking:${leagueName}`,
      league_minRating,
      league_maxRating
    );

    if (currentLeague_users.length === 0) continue;

    //check for active test_ids and their allocated users count
    const previousActiveMatchIds = await redisClient.zRangeByScore(
      'active_matches',
      0,
      now
    );

    //match_Ids previously present and unfilled
    for (const matchId of previousActiveMatchIds) {
      const matchData = await redisClient.hGetAll(`match:${matchId}`);
      if (!matchData || matchData.leagueName != leagueName) continue;

      const matchCreated = parseInt(matchData.createdAt);
      const timeElapsed = now - matchCreated;

      // Check if this match is full
      let currentUsers = await redisClient.sMembers(`match:${matchId}:users`);
      if (currentUsers.length >= MATCH_SIZE) continue;

      // Fill this match with users already waiting in current League
      const remainingSlots = MATCH_SIZE - currentUsers.length;
      let usersToAdd;

      if (currentLeague_users.length >= remainingSlots) {
        usersToAdd = currentLeague_users.splice(0, remainingSlots);

        //add usersToAdd from currentLeague in the matchId and remove them from matchmaking Queue
        for (const userId of usersToAdd) {
          await redisClient.sAdd(`match:${matchId}:users`, userId);
          await redisClient.zRem(`matchmaking:${leagueName}`, userId);
          await redisClient.hSet(`user_status:${userId}`, {
            status: 'matched',
            testId: matchId,
          });
        }
      } else {
        //add currentLeague_users in the matchId and remove them from matchmaking Queue
        for (const userId of currentLeague_users) {
          await redisClient.sAdd(`match:${matchId}:users`, userId);
          await redisClient.zRem(`matchmaking:${leagueName}`, userId);
          await redisClient.hSet(`user_status:${userId}`, {
            status: 'matched',
            testId: matchId,
          });
        }
      }

      // Check if this match is full
      currentUsers = await redisClient.sMembers(`match:${matchId}:users`);
      if (currentUsers.length >= MATCH_SIZE) continue;

      // Expand range if matchId is old and no users in current league [40ms wait time]
      let expanded_users;
      if (timeElapsed >= LEAGUE_EXPAND_2_MS) {
        EXPAND_DELTA = 400;
        league_minRating -= EXPAND_DELTA;
        league_maxRating += EXPAND_DELTA;

        // Get more users within the new range
        expanded_users = await redisClient.zRangeByScore(
          `matchmaking:${leagueName}`,
          league_minRating,
          league_maxRating
        );
      } else if (timeElapsed >= LEAGUE_EXPPAND_1_MS) {
        EXPAND_DELTA = 200;
        league_minRating -= EXPAND_DELTA;
        league_maxRating += EXPAND_DELTA;

        // Get more users within the new range
        expanded_users = await redisClient.zRangeByScore(
          `matchmaking:${leagueName}`,
          league_minRating,
          league_maxRating
        );
      }

      if (expanded_users) {
        for (const userId of expanded_users) {
          await redisClient.sAdd(`match:${matchId}:users`, userId);
          await redisClient.zRem(`matchmaking:${leagueName}`, userId);
          await redisClient.hSet(`user_status:${userId}`, {
            status: 'matched',
            testId: matchId,
          });
        }
      }

      if (EXPAND_DELTA > MATCH_TIMEOUT_MS) {
        //Fetch the questions for the current match_id and store them in DB
        //Main Backend server will fetch the questions after the match_Id shows 'READY'
        await redisClient.hSet(`match_status:${matchId}`, {
          status: 'ready',
          readyAt: Date.now(),
        });
      }
    }

    //No active test_ids
    //      Find the count of required new test_ids to be created and associated the users with those test_ids
    const currentLeague_users_new = await redisClient.zRangeByScore(
      `matchmaking:${leagueName}`,
      league_minRating,
      league_maxRating
    );

    if (currentLeague_users_new.length === 0) continue;

    const new_Tests_Required = Math.ceil(currentLeague_users_new.length / 100);
    for (let i = 0; i < new_Tests_Required; i++) {
      const new_match_id = uuidv4();
      const new_match_users = currentLeague_users_new.splice(0, MATCH_SIZE);

      await redisClient.zAdd('active_matches', {
        score: now,
        value: new_match_id,
      });

      await redisClient.hSet(`match:${new_match_id}`, {
        leagueName,
        createdAt: now,
      });

      for (const userId of new_match_users) {
        await redisClient.sAdd(`match:${new_match_id}:users`, userId);
        await redisClient.zRem(`matchmaking:${leagueName}`, userId);
        await redisClient.hSet(`user_status:${userId}`, {
          status: 'matched',
          testId: new_match_id,
        });
      }
      await redisClient.hSet(`match_status:${new_match_id}`, {
        status: 'ready',
        readyAt: Date.now(),
      });
    }
  }
}
