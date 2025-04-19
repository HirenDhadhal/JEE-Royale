import { prisma, redisClient } from '../index';

export async function connectToRedis(redisClient: any) {
  redisClient.on('error', (err: any) => console.log('Redis Client Error', err));
  await redisClient.connect();
}

//Create 30 questions for a given test_id and mark that in redis
export async function createdQuestionsForTest(testId: number) {
  const subjects = ['Physics', 'Chemistry', 'Maths'];
  const questions_to_pick = 10;
  let Test_Questions: any[] | PromiseLike<any[]> = [];
  try {
    subjects.map(async (subject) => {
      const totalQuestions = await prisma.questions.count({
        where: {
          subject,
        },
      });

      const no_of_Questions_to_select = Math.min(
        questions_to_pick,
        totalQuestions
      );

      const randomQuestionindex: number[] = [];
      while (randomQuestionindex.length < no_of_Questions_to_select) {
        const randomIndex = Math.floor(Math.random() * totalQuestions);
        if (!randomQuestionindex.includes(randomIndex)) {
          randomQuestionindex.push(randomIndex);
        }
      }

      randomQuestionindex.sort((a, b) => a - b);

      const randomQuestions = await Promise.all(
        randomQuestionindex.map(async (index) => {
          const question = await prisma.questions.findFirst({
            where: {
              subject: subject,
            },
            skip: index,
          });

          Test_Questions.push(question);
          //Store TesId-QuestionId-CorrectOptionId mapping in Redis
          await redisClient.hSet(
            `test_answers:${testId}`,
            `${question?.id}`,
            String(question?.correct_option_id)
          );
        })
      );

      //TODO-store testID-QuestionID mapping in Prisma
      //Parse the Ids from string into Int and then add to DB

      return Test_Questions;
    });
  } catch (err) {
    console.error('Error fetching random questions:', err);
  }
}

//function calculate Rating Change [Delta] for each player after a test and store in DB [GlobalUserTestScores]
export async function calculateDeltaAfterTest(testId: number) {
  //fetch all data for this test_id from UserTestScores table
  const totalScore = 4 * 30;
  const currentTestData = await prisma.userTestScores.findMany({
    where: {
      test_id: testId,
    },
  });

  //iterate over each entry and keep track of each user's score in a Map
  const userScores = new Map<number, number>();

  currentTestData.map((val, index) => {
    const curr_userId = val.user_id;
    const curr_ques_score = val.score;

    if (curr_ques_score) {
      const curr_user_score = userScores.get(curr_userId) || 0;
      userScores.set(curr_userId, curr_ques_score + curr_user_score);
    }
  });

  //Calculate Rank for each user_Id after all processing is done
  const sortedEntries = Array.from(userScores.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  let prevScore: number | null = null;
  let currentRank = 1;
  const userRanks = new Map<number, number>();

  sortedEntries.forEach(([userId, score], index) => {
    if (score !== prevScore) {
      currentRank = index + 1;
      prevScore = score;
    }
    userRanks.set(userId, currentRank);
  });

  let totalUserInTest = userScores.size;
  let userRatingMap = new Map<number, number>();

  userScores.forEach(async (userId, userScore) => {
    const allUserRating = await prisma.userProfileStats.findFirst({
      where: {
        user_id: userId,
      },
      select: {
        rating: true,
      },
    });

    userRatingMap.set(userId, allUserRating?.rating!);
  });

  //CALCULATE Delta change
  //At the end store the data in GlobalUserTestScores table
  userScores.forEach(async (userId, userScore) => {
    const userRank = userRanks.get(userId);
    let userRatingChange = calculateRatingChange(userRank!, totalUserInTest);
    const userCurrentRating = userRatingMap.get(userId);

    if (userCurrentRating! <= 500 && userRatingChange < 0) userRatingChange = 0;
    else if (
      userCurrentRating! >= 2300 &&
      userCurrentRating! < 2400 &&
      userRatingChange > 0
    )
      userRatingChange = userRatingChange * 0.95;
    else if (
      userCurrentRating! >= 2400 &&
      userCurrentRating! < 2600 &&
      userRatingChange > 0
    )
      userRatingChange = userRatingChange * 0.9;
    else if (
      userCurrentRating! >= 2600 &&
      userCurrentRating! < 3000 &&
      userRatingChange > 0
    )
      userRatingChange = userRatingChange * 0.8;
    else if (userCurrentRating! >= 3000 && userRatingChange > 0)
      userRatingChange = userRatingChange * 0.7;

    await prisma.globalUserTestScores.create({
      data: {
        test_id: testId,
        user_id: userId,
        total_marks: totalScore,
        user_scored_marks: userScore,
        delta_change: userRatingChange,
        Rank: userRank!,
      },
    });

    //Update each User's profile [UserProfileStats] with new Rating and Delta [update Rank also if needed]
    const updatedUserRating = userCurrentRating || 0 + userRatingChange;
    const updatedUserLeague = getLeague(updatedUserRating);
    await prisma.userProfileStats.update({
      where: {
        user_id: userId,
      },
      data: {
        rating: updatedUserRating,
        league_name: updatedUserLeague,
      },
    });
  });
}

//function to recalculate League of a user whenever their Rating-delta changes
function calculateRatingChange(
  rank: number,
  totalPlayers: number = 100,
  maxGain = 70,
  maxLoss = -30
): number {
  const normalizedRank = (rank - 1) / (totalPlayers - 1);
  return Math.round(maxGain + (maxLoss - maxGain) * normalizedRank);
}

export function getLeague(userRating: number) {
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

  return leagueName;
}

// The worker will run every 1-2 seconds, scan every league we have, find the number of active users searching for a match.
// Create new match_ids as per the queue number in that league only if there are no existing open match_ids which have less than 100 players. Also, track the time a single match_id has been open.
//Whenever a player add been added to a matchid, remove from the redis queue
// If within 20 seconds it does not get filled, expand the search range next time.
//Use POLLING every 10 seconds to get status of current
// When we hit 100 users or 60 second timeout with some players in a match_id, we start the match.
