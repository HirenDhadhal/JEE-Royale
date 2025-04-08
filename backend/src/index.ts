import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
app.use(express.json());
app.use(cors());
const prisma = new PrismaClient();

app.get('/api/signup', async (req, res) => {});
app.get('/api/signin', async (req, res) => {});

app.get('/api/start-test', (req, res) => {
  //SEARCH and MATCH functionality
  //search for other 99 players and assign them this test_id
  //CREATE all questions for a new test_id
  //send these questions to all the users in the test
});

app.post('/api/:test_id/:user_id', async (req, res) => {
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

app.get('/api/leaderboard', (req, res) => {
  //fetch top 20 rows from the LEADERBOARD table
  //LEADERBOARD table should update data every 5-7min
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
