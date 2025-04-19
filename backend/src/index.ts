import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import {
  connectToRedis,
  createdQuestionsForTest,
  getLeague,
} from './utils/utils';

const app = express();
app.use(express.json());
app.use(cors());
const prisma = new PrismaClient();
const redisClient = createClient();
export { prisma, redisClient };
connectToRedis(redisClient);

app.get('/api/signup', async (req, res) => {
  //Add the entry in User table and UseProfileStats table
});
app.get('/api/signin', async (req, res) => {});

app.post('/api/start-test', async (req, res) => {
  const user_id = req.body.user_id;
  const rating = req.body.rating;
  const leagueName = getLeague(rating);

  //add the user in Redis queue for matchmaking
  await redisClient.zAdd(`matchmaking:${leagueName}`, rating, user_id);

  //Worker will match user with other 99 users and then create a test for single test_id with all questions

  //Implement POLLING below and as soon as we get the test_id, load all questions from that test_id
  //Constantly check for in redis if the user is assigned a test or not
  let status = 'waiting';

  //TODO- Use setTimeOut here rather than while loop
  while (status != 'matched') {
    const currentStatus = await redisClient.hGet(`user:${user_id}`, 'status');
    status = currentStatus!;
  }

  const testId = await redisClient.hGet(`user_status:${user_id}`, 'testId');
  const testId_int = parseInt(testId!);

  //load all questions related to this test_id and send to the user as response
  let testId_questions_created = createdQuestionsForTest(testId_int);

  res.send(testId_questions_created);
});

app.post('/api/:test_id/:user_id/save-answers', async (req, res) => {
  const user_id = req.params.user_id;
  const test_id = req.params.test_id;
  const attempts = req.body.attempts;

  try {
    //fetch all the responses marked till now from Redis and store in DB
    await redisClient.hSet(`test_attempt:${test_id}:${user_id}`, attempts);
    res.status(200).json({ message: 'Answers saved/updated successfully' });
  } catch (err) {
    console.error('Error saving answer in Redis: ', err);
    res.status(500).json({ message: 'Error saving answers' });
  }
});

app.post('/api/:test_id/:user_id/end-test', async (req, res) => {
  //TODO-BEFORE THIS WE SHOULD SAVE ALL ANSWERS MARKED BEFORE ENDING TEST INTO REDIS
  //Fetch all answer for the test_id + user_id combination from Redis
  const user_id = req.params.user_id;
  const test_id = req.params.test_id;

  try {
    // const redisKey = `test_attempt:${test_id}:${user_id}`;

    // Fetch all question attempts for this user in the test
    // const attempts = await redisClient.hGetAll(redisKey);

    //restructure them and store in DB
    const questionIds = await redisClient.hKeys(
      `test_attempt:${test_id}:${user_id}`
    );

    //for each question_id, fetch the marked_optin_id, calculate score and update in the DB [UserTestScores] table
    const optionIds = await redisClient.hmGet(
      `test_attempt:${test_id}:${user_id}`,
      questionIds
    );

    questionIds.map(async (qId, idx) => {
      const correct_option_id = await redisClient.hGet(
        `test_answers:${test_id}`,
        qId
      );
      const selected_option_id = parseInt(optionIds[idx]);
      await prisma.userTestScores.create({
        data: {
          user_id: parseInt(user_id),
          test_id: parseInt(test_id),
          question_id: parseInt(qId),
          attempted_option_id: selected_option_id,
          score: selected_option_id === parseInt(correct_option_id!) ? 4 : 0,
        },
      });

      res.status(200).send('Answers saved successfully in Database');

      //TODO- Trigger a function which will recalculate the rating change [Detla] for each user in current testID
      //and store it in DB [GlobalUserTestScores] table
    });
  } catch (err) {
    console.error(
      'Error fetching attempts from Redis and storing in DB: ',
      err
    );
    res.status(500).json({ message: 'Error ending test' });
  }
});

app.post('/api/:test_id/:user_id/mark-answers-db', async (req, res) => {
  //save the answers marked for some questions if any
  const markedAnswers: [] = req.body.responses;

  markedAnswers.map(async (response: any) => {
    const test_id = parseInt(req.params.test_id);
    const user_id = parseInt(req.params.user_id);
    const question_id = parseInt(response.question_id);
    const markedAnswer_id = parseInt(response.option_id);
    let score = 0;

    //find the correct option_id for the current question_id in the "QUESTIONS" table
    try {
      const curr_question = await prisma.questions.findFirst({
        where: {
          id: question_id,
        },
      });
      const correct_option_id = curr_question?.correct_option_id;

      if (markedAnswer_id === correct_option_id)
        score = curr_question!.question_score;

      //Create a entry in the "UserTestScores" table with above details
      const response = await prisma.userTestScores.create({
        data: {
          test_id,
          user_id,
          question_id,
          attempted_option_id: markedAnswer_id,
          score,
        },
      });

      res.send({ message: `Marked ${question_id} for ${user_id} in DB` });
    } catch (err) {
      console.error({
        message: `Error while saving ${question_id} for ${user_id} in DB`,
      });

      res.status(500).json({
        message: `Error while saving ${question_id}, please try again`,
      });
    }
  });
});

app.post('/api/create-question', async (req, res) => {
  const question_text = req.body.question;
  const option_1 = req.body.option1;
  const option_1_id = 1;
  const option_2 = req.body.option2;
  const option_2_id = 2;
  const option_3 = req.body.option3;
  const option_3_id = 3;
  const option_4 = req.body.option4;
  const option_4_id = 4;
  const correct_option_id = parseInt(req.body.correct_option);
  const subject = req.body.subject;
  const question_score = parseInt(req.body.score);

  //generate the ids for the ques, options, answer
  //store in DB
  try {
    const response = await prisma.questions.create({
      data: {
        question_text,
        option_1,
        option_1_id,
        option_2,
        option_2_id,
        option_3,
        option_3_id,
        option_4,
        option_4_id,
        correct_option_id,
        question_score,
        subject,
      },
    });

    res.send({ message: 'Question created successfully' });
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Error while creating new Question, Please try again' });
  }
});

app.post('/api/create-custom-test', async (req, res) => {
  //create a new custom test based on existing questions
  //This expects a bunch of question_ids which we will re-order and send as response to the user
});

app.post('/api/profile/:user_id', async (req, res) => {
  //fetch the user info
  const user_id = parseInt(req.params.user_id);

  try {
    const UserData = await prisma.user.findFirst({
      where: {
        id: user_id,
      },
      select: {
        email: true,
        name: true,
        createdAt: true,
        UserProfileStats: true,
      },
    });

    res.json(UserData);
  } catch (err) {
    console.log(err);
    res.send({ message: `Error fetching user profile data` });
  }
});

app.post('/api/all-tests/:user_id', async (req, res) => {
  //fetch the user STATs for all past test
  //overall details from "GlobalUserTestScores" table
  const user_id = parseInt(req.params.user_id);

  try {
    const AllTestData = await prisma.globalUserTestScores.findMany({
      where: { user_id: user_id },
    });

    res.send(AllTestData);
  } catch (err) {
    res.status(500).json({ message: 'Error fetch previous Test data' });
  }
});

app.post('/api/all-tests/:user_id/:test_id', async (req, res) => {
  //fetch the user STATs for all a particular test
  //and in-depth details for each test from "USER Attempted Tests" table for each test_id
  const user_id = parseInt(req.params.user_id);
  const test_id = parseInt(req.params.test_id);

  try {
    const SingleTestData = await prisma.userTestScores.findMany({
      where: {
        test_id,
        user_id,
      },
      include: {
        question: true,
      },
    });

    res.send(SingleTestData);
  } catch (err) {
    res.status(500).json({ message: 'Error fetch Test data for User' });
  }
});

//  todo
app.get('/api/leaderboard', async (req, res) => {
  const raw_leaderboardData = await redisClient.get('cached_leaderboard');
  const cachedleaderboardData = raw_leaderboardData
    ? JSON.parse(raw_leaderboardData)
    : [];

  if (cachedleaderboardData.length !== 0) {
    res.send(cachedleaderboardData);
  }

  //LEADERBOARD table should update data every 10min
  const allUserRatings = await prisma.userProfileStats.findMany({
    select: {
      user_id: true,
      rating: true,
      league_name: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  //Re-calculate the Leaderboard ranks in Redis
  for (const { user_id, rating, league_name, user } of allUserRatings) {
    if (!user || !user.name) continue;

    // 1. Add to global ranking ZSET
    await redisClient.zAdd('global_ranking', {
      score: rating,
      value: user_id.toString(),
    });

    // 2. Store metadata in user hash
    await redisClient.hSet(`user_metadata:${user_id}`, {
      name: user.name,
      league_name,
      rating: rating.toString(),
    });
  }

  const leaderboardData = [];

  for (const { user_id } of allUserRatings) {
    const uid = user_id.toString();
    const rank = await redisClient.zRevRank('global_ranking', uid);

    const metadata = await redisClient.hGetAll(`user_metadata:${uid}`);

    if (!rank || !metadata.name) continue;

    leaderboardData.push({
      user_id: uid,
      rank: rank + 1,
      name: metadata.name,
      rating: parseInt(metadata.rating),
    });
  }

  await redisClient.set('cached_leaderboard', JSON.stringify(leaderboardData), {
    EX: 600, // expires in 10 minutes
  });

  res.send(leaderboardData);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
