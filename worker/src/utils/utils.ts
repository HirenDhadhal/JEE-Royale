export async function connectToRedis(redisClient: any) {
  redisClient.on('error', (err: any) => console.log('Redis Client Error', err));
  await redisClient.connect();
}

export const leaguesRanges = [
  { name: 'Newbie', min: 0, max: 1199 },
  { name: 'Pupil', min: 1200, max: 1399 },
  { name: 'Specialist', min: 1400, max: 1599 },
  { name: 'Expert', min: 1600, max: 1899 },
  { name: 'Candidate Master', min: 1900, max: 2099 },
  { name: 'Master', min: 2100, max: 2299 },
  { name: 'International Master', min: 2300, max: 2399 },
  { name: 'GrandMaster', min: 2400, max: 2599 },
  { name: 'International GrandMaster GrandMaster', min: 2600, max: 2999 },
  { name: 'Legendary GrandMaster', min: 3000, max: Infinity },
];
