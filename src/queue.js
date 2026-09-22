class JobQueue {
  constructor({ store, processJob, pollMs = Number(process.env.QUEUE_POLL_MS || 1000) }) {
    this.store = store;
    this.processJob = processJob;
    this.pollMs = pollMs;
    this.timer = null;
    this.running = false;
  }

  start() { this.timer = setInterval(() => this.drain(), this.pollMs); this.drain(); }
  stop() { clearInterval(this.timer); }

  async drain() {
    if (this.running) return;
    const job = this.store.nextJob();
    if (!job) return;
    this.running = true;
    try {
      await this.store.updateJob(job, { status: 'processing', attempts: job.attempts + 1, lastError: null });
      await this.processJob(job);
      await this.store.updateJob(job, { status: 'completed', completedAt: new Date().toISOString() });
    } catch (error) {
      const retry = job.attempts < job.maxAttempts;
      await this.store.updateJob(job, {
        status: retry ? 'queued' : 'failed',
        lastError: error.message,
        nextAttemptAt: retry ? new Date(Date.now() + (2 ** job.attempts) * 1000).toISOString() : null,
      });
    } finally { this.running = false; }
  }
}

module.exports = { JobQueue };
