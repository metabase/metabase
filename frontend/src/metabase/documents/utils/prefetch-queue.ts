export const MAX_CONCURRENT_PREFETCHES = 3;

const IDLE_TIMEOUT_MS = 2000;

// Fallback delay when requestIdleCallback is unavailable (e.g. Safari < 16.4).
const FALLBACK_DELAY_MS = 200;

type Registration = {
  id: string;
  getElement: () => HTMLElement | null;
  isInViewport: () => boolean;
};

type Listener = () => void;

export type IdleScheduler = {
  schedule: (cb: () => void) => number;
  cancel: (handle: number) => void;
};

export interface PrefetchQueue {
  setEnabled(enabled: boolean): void;
  register(reg: Registration): () => void;
  reportLoading(id: string, loading: boolean): void;
  notifyViewportChange(): void;
  hasTicket(id: string): boolean;
  hasInflightLoads(): boolean;
  subscribe(cb: Listener): () => void;
  destroy(): void;
}

function defaultScheduler(): IdleScheduler {
  if (typeof requestIdleCallback === "function") {
    return {
      schedule: (cb) => requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS }),
      cancel: (handle) => cancelIdleCallback(handle),
    };
  }
  return {
    schedule: (cb) => window.setTimeout(cb, FALLBACK_DELAY_MS),
    cancel: (handle) => window.clearTimeout(handle),
  };
}

export class PrefetchQueueStore implements PrefetchQueue {
  private registrations = new Map<string, Registration>();
  private inflightLoads = new Set<string>();
  private prefetchedIds = new Set<string>();
  private isEnabled = true;
  private listeners = new Set<Listener>();
  private idleHandle: number | null = null;
  private scheduler: IdleScheduler;

  constructor(scheduler: IdleScheduler = defaultScheduler()) {
    this.scheduler = scheduler;
  }

  setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled) {
      return;
    }
    this.isEnabled = enabled;
    this.scheduleTick();
  }

  register(reg: Registration): () => void {
    this.registrations.set(reg.id, reg);
    this.scheduleTick();
    return () => {
      this.registrations.delete(reg.id);
      this.prefetchedIds.delete(reg.id);
      this.inflightLoads.delete(reg.id);
      this.scheduleTick();
    };
  }

  reportLoading(id: string, loading: boolean): void {
    const had = this.inflightLoads.has(id);
    if (loading) {
      this.inflightLoads.add(id);
    } else {
      this.inflightLoads.delete(id);
    }
    if (had !== loading) {
      this.scheduleTick();
    }
  }

  notifyViewportChange(): void {
    this.scheduleTick();
  }

  hasTicket(id: string): boolean {
    return this.prefetchedIds.has(id);
  }

  hasInflightLoads(): boolean {
    return this.inflightLoads.size > 0;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  destroy(): void {
    if (this.idleHandle !== null) {
      this.scheduler.cancel(this.idleHandle);
      this.idleHandle = null;
    }
  }

  private scheduleTick(): void {
    if (this.idleHandle !== null) {
      return;
    }
    this.idleHandle = this.scheduler.schedule(() => {
      this.idleHandle = null;
      this.recompute();
    });
  }

  private recompute(): void {
    if (!this.isEnabled) {
      return;
    }

    const slotsAvailable = MAX_CONCURRENT_PREFETCHES - this.inflightLoads.size;
    if (slotsAvailable <= 0) {
      return;
    }

    const viewportCenter =
      typeof window !== "undefined" ? window.innerHeight / 2 : 0;

    const candidates: Array<{ id: string; distance: number }> = [];
    for (const [id, reg] of this.registrations) {
      if (this.prefetchedIds.has(id) || reg.isInViewport()) {
        continue;
      }
      const el = reg.getElement();
      if (!el) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      const distance = Math.min(
        Math.abs(rect.top - viewportCenter),
        Math.abs(rect.bottom - viewportCenter),
      );
      candidates.push({ id, distance });
    }

    if (candidates.length === 0) {
      return;
    }

    candidates.sort((a, b) => a.distance - b.distance);

    const idsToPrefetch = candidates.slice(0, slotsAvailable);
    for (const { id } of idsToPrefetch) {
      this.prefetchedIds.add(id);
    }

    this.notify();
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }
}
