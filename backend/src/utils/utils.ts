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

      const randomQuestionIdx: number[] = [];
      while (randomQuestionIdx.length < no_of_Questions_to_select) {
        const randomIndex = Math.floor(Math.random() * totalQuestions);
        if (!randomQuestionIdx.includes(randomIndex)) {
          randomQuestionIdx.push(randomIndex);
        }
      }

      randomQuestionIdx.sort((a, b) => a - b);

      const randomQuestions = await Promise.all(
        randomQuestionIdx.map(async (idx) => {
          const question = await prisma.questions.findFirst({
            where: {
              subject: subject,
            },
            skip: idx,
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

  currentTestData.map((val, idx) => {
    const curr_userId = val.user_id;
    const curr_ques_score = val.score;

    if (curr_ques_score) {
      const curr_user_score = userScores.get(curr_userId) || 0;
      userScores.set(curr_userId, curr_ques_score + curr_user_score);
    }
  });
  //Calculate Rank for each user_Id after all processing is done
  //At the end store the data in GlobalUserTestScores table
  //SEPERATE FUNCTION
  //Update each User's profile with new Rating and Delta [update Rank also if needed]
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
