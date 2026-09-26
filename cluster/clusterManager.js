const cluster = require('cluster');
const os = require('os');

function chunkArray(items, buckets) {
  const result = Array.from({ length: buckets }, () => []);
  items.forEach((item, index) => {
    result[index % buckets].push(item);
  });
  return result;
}

function start({ shardCount = 1, onPrimary, onWorker }) {
  if (cluster.isPrimary) {
    const cpuCount = os.cpus().length || 1;
    const totalShards = Math.max(1, Number(shardCount) || 1);
    const workerCount = Math.max(1, Math.min(cpuCount, totalShards));

    if (typeof onPrimary === 'function') {
      onPrimary();
    }

    // Split shard ids across workers to avoid duplicate gateways.
    const shardIds = Array.from({ length: totalShards }, (_, i) => i);
    const shardGroups = chunkArray(shardIds, workerCount);
    const envMap = new Map();

    shardGroups.forEach((group) => {
      const env = {
        SHARD_IDS: group.join(','),
        SHARD_COUNT: String(totalShards),
      };
      const worker = cluster.fork(env);
      envMap.set(worker.id, env);
    });

    cluster.on('online', (worker) => {
      console.log(`[cluster] Worker ${worker.id} online (pid ${worker.process.pid})`);
    });

    cluster.on('exit', (worker, code, signal) => {
      console.error(`[cluster] Worker ${worker.id} exited (code ${code}, signal ${signal}). Restarting...`);
      const env = envMap.get(worker.id) || {};
      const next = cluster.fork(env);
      envMap.set(next.id, env);
    });
  } else {
    const shardIds = (process.env.SHARD_IDS || '0')
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id));
    const totalShards = Number(process.env.SHARD_COUNT || shardCount || 1);

    if (typeof onWorker === 'function') {
      onWorker({ shardIds, shardCount: totalShards });
    }
  }
}

module.exports = {
  start,
};
