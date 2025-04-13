import express from 'express';
import cors from 'cors';
import { createClient } from 'redis';
import { connectToRedis } from './utils/utils';

const app = express();
app.use(express.json());
app.use(cors());
const redisClient = createClient();
connectToRedis(redisClient);

//Worker will macth user with other 99 users and then create a test for single test_id with all questions
//Implement POLLING below and as soon as we get the test_id, load all questions from that test_id
