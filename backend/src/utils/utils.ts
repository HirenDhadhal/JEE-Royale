export async function connectToRedis(redisClient: any) {
  redisClient.on('error', (err: any) => console.log('Redis Client Error', err));
  await redisClient.connect();
}

//TODO
//function to recalculate League of a user whenever their Rating-delta changes

export async function getLeague(userRating: number) {
  let leagueName = 'Newbie';

  if (userRating >= 1200 && userRating < 1400) leagueName = 'Pupil';
  else if (userRating >= 1400 && userRating < 1600) leagueName = 'Specialist';
  else if (userRating >= 1600 && userRating < 1900) leagueName = 'Expert';
  else if (userRating >= 1900 && userRating < 2100)
    leagueName = 'Candidate Master';
  else if (userRating >= 2100 && userRating < 2300) leagueName = 'Master';
  else if (userRating >= 2300 && userRating < 2400)
    leagueName = 'International Master';
  else if (userRating >= 2400 && userRating < 2600) leagueName = 'GrandMaster';
  else if (userRating >= 2600 && userRating < 3000)
    leagueName = 'International GrandMaster GrandMaster';
  else if (userRating >= 3000) leagueName = 'Legendary GrandMaster';
}

// The worker will run every 1-2 seconds, scan every league we have, find the number of active users searching for a match.
// Create new match_ids as per the queue number in that league only if there are no existing open match_ids which have less than 100 players. Also, track the time a single match_id has been open.
//Whenever a player add been added to a matchid, remove from the redis queue
// If within 20 seconds it does not get filled, expand the search range next time.
//Use POLLING every 10 seconds to get status of current
// When we hit 100 users or 60 second timeout with some players in a match_id, we start the match.
