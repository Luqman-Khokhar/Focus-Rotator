'use strict';

// Pure round-robin timer. No Electron, no I/O: clock and side effects are injected.
class Scheduler {
  constructor({ getCount, onFire, now = Date.now, intervalSec = 180 }) {
    this.getCount = getCount;
    this.onFire = onFire;
    this.now = now;
    this.intervalSec = intervalSec;
    this.status = 'stopped'; // stopped | running | paused
    this.activeIndex = -1;
    this.endAt = 0;
    this.remainingMs = intervalSec * 1000;
  }

  setInterval(sec) {
    this.intervalSec = sec;
    this.remainingMs = sec * 1000;
    if (this.status === 'running') this.endAt = this.now() + this.remainingMs;
  }

  start() {
    if (this.status === 'running') return;
    if (this.status === 'stopped') this.remainingMs = this.intervalSec * 1000;
    this.endAt = this.now() + this.remainingMs;
    this.status = 'running';
  }

  pause() {
    if (this.status !== 'running') return;
    this.remainingMs = Math.max(0, this.endAt - this.now());
    this.status = 'paused';
  }

  stop() {
    this.status = 'stopped';
    this.activeIndex = -1;
    this.remainingMs = this.intervalSec * 1000;
  }

  skip() {
    if (this.status === 'stopped') return;
    this._fire();
  }

  tick() {
    if (this.status === 'running' && this.now() >= this.endAt) this._fire();
  }

  // keep activeIndex valid when a target is removed
  targetRemoved(index) {
    if (index <= this.activeIndex) this.activeIndex = Math.max(-1, this.activeIndex - 1);
  }

  _fire() {
    const n = this.getCount();
    this.endAt = this.now() + this.intervalSec * 1000;
    this.remainingMs = this.intervalSec * 1000;
    if (n === 0) return;
    this.activeIndex = (this.activeIndex + 1) % n;
    this.onFire(this.activeIndex);
  }

  snapshot() {
    const remainingMs = this.status === 'running' ? Math.max(0, this.endAt - this.now()) : this.remainingMs;
    return { status: this.status, intervalSec: this.intervalSec, remainingMs, activeIndex: this.activeIndex };
  }
}

module.exports = { Scheduler };
