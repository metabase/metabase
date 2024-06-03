import { isInstrumentationEnabled } from "metabase/env";

type PerformanceEvent = {
  name: string;
  timestamp: number;
  data?: unknown;
};

interface IPerformanceTracker {
  trackEvent(name: string, data?: unknown): void;
}

type OnIdleCallback = (events: PerformanceEvent[]) => void;

export class PerformanceTracker implements IPerformanceTracker {
  _performanceObserver: PerformanceObserver;
  _idleTimer: ReturnType<typeof setTimeout> | null = null;
  _idleTimeoutMs: number;
  _events: PerformanceEvent[] = [];
  _onIdle: OnIdleCallback;

  constructor(idleTimeoutMs: number, onIdle: OnIdleCallback) {
    this._onIdle = onIdle;
    this._idleTimeoutMs = idleTimeoutMs;

    this._performanceObserver = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        this._trackEvent("longtask", entry.startTime, {
          duration: entry.duration,
        });
      });
    });
    this._performanceObserver.observe({ type: "longtask", buffered: true });
  }

  _trackEvent(name: string, timestamp: number, data?: unknown) {
    this._events.push({ name, timestamp, data });

    if (this._idleTimer != null) {
      clearInterval(this._idleTimer);
    }

    this._idleTimer = setTimeout(() => {
      this._onIdle(this._events);
    }, this._idleTimeoutMs);
  }

  trackEvent(name: string, data?: unknown) {
    this._trackEvent(name, performance.now(), data);
  }
}

export class DummyPerformanceTracker implements IPerformanceTracker {
  trackEvent() {}
}

export const createPerformanceTracker = (
  idleTimeoutMs: number,
  onIdle: OnIdleCallback,
): IPerformanceTracker => {
  if (isInstrumentationEnabled) {
    return new PerformanceTracker(idleTimeoutMs, onIdle);
  }

  return new DummyPerformanceTracker();
};
