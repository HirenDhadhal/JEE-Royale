export async function connectToRedis(redisClient: any) {
  redisClient.on('error', (err: any) => console.log('Redis Client Error', err));
  await redisClient.connect();
}
