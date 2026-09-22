const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Store {
  constructor(filePath = process.env.DATA_PATH || path.join(process.cwd(), 'data', 'etrainer.json')) {
    this.filePath = filePath;
    this.data = { jobs: [], calls: [], objections: [], courses: [], roleplayScenarios: [] };
    this.writeChain = Promise.resolve();
  }

  async init() {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.data = { ...this.data, ...JSON.parse(await fs.promises.readFile(this.filePath, 'utf8')) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.persist();
    }
  }

  async persist() {
    const write = async () => {
      const temporary = `${this.filePath}.tmp`;
      await fs.promises.writeFile(temporary, JSON.stringify(this.data, null, 2));
      await fs.promises.rename(temporary, this.filePath);
    };
    this.writeChain = this.writeChain.then(write, write);
    return this.writeChain;
  }

  async createJob(input) {
    const existing = this.data.jobs.find(job => job.idempotencyKey === input.idempotencyKey);
    if (existing) return { job: existing, duplicate: true };
    const now = new Date().toISOString();
    const job = {
      id: crypto.randomUUID(), status: 'queued', attempts: 0, maxAttempts: input.maxAttempts || 3,
      createdAt: now, updatedAt: now, ...input,
    };
    this.data.jobs.push(job);
    await this.persist();
    return { job, duplicate: false };
  }

  nextJob() {
    return this.data.jobs.find(job => job.status === 'queued' && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= Date.now()));
  }

  async updateJob(job, fields) {
    Object.assign(job, fields, { updatedAt: new Date().toISOString() });
    await this.persist();
    return job;
  }

  async saveCall(call) {
    const existing = this.data.calls.find(item => item.jobId === call.jobId);
    if (existing) return existing;
    const record = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...call };
    this.data.calls.push(record);
    for (const objection of record.analysis?.objections || []) {
      this.data.objections.push({ id: crypto.randomUUID(), callId: record.id, status: 'pending', createdAt: record.createdAt, ...objection });
    }
    await this.persist();
    return record;
  }

  listCalls({ agent, limit = 50 } = {}) {
    return this.data.calls
      .filter(call => !agent || call.agent === agent)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(Number(limit) || 50, 100));
  }

  getCall(id) { return this.data.calls.find(call => call.id === id); }
}

module.exports = { Store };
