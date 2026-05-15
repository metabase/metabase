const MAX_CONCURRENT_PREFETCHES = 3;

// Upper bound for how long the browser may delay an idle callback before
// we run it anyway. Generous enough that we don't pre-empt real work, low
// enough that prefetch eventually fires on busy pages.
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

/**
 * Public surface of the prefetch coordinator. Decouples consumers from
 * the concrete class so tests can supply lightweight stubs.
 */
export interface PrefetchQueue {
  setEnabled(enabled: boolean): void;
  register(reg: Registration): () => void;
  reportLoading(id: string, loading: boolean): void;
  notifyViewportChange(): void;
  /**
   * Mark a card as "force visible" — the viewport hook will report
   * isInViewport=true regardless of IntersectionObserver state. Used
   * to pre-mount a card synchronously before a programmatic scroll
   * (e.g. anchor navigation) so the viz is ready before the user can
   * see the new scroll position. The force flag auto-clears once IO
   * confirms the card is intersecting.
   */
  forceVisible(id: string): void;
  notifyIntersectionState(id: string, isIntersecting: boolean): void;
  hasTicket(id: string): boolean;
  isForceVisible(id: string): boolean;
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

/**
 * Idle-time prefetch coordinator for off-screen card embeds.
 *
 * Each card embed registers itself; whenever the browser reports a free
 * idle slice (via requestIdleCallback), the queue grants "prefetch
 * tickets" to the off-screen cards nearest the viewport, up to
 * MAX_CONCURRENT_PREFETCHES in-flight loads at a time. Cards with a
 * ticket flip their `skip` flag off, so their RTK Query fetches fire
 * and results land in the cache before the user scrolls to them.
 *
 * Tickets are monotonic: once granted, a card keeps its ticket so its
 * query result stays cached. Slot accounting uses `inflightLoads` so the
 * coordinator doesn't compete with viewport loads.
 */
export class PrefetchQueueStore implements PrefetchQueue {
  private registrations = new Map<string, Registration>();
  private inflightLoads = new Set<string>();
  private prefetchedIds = new Set<string>();
  private forceVisibleIds = new Set<string>();
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
      this.forceVisibleIds.delete(reg.id);
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

  forceVisible(id: string): void {
    if (this.forceVisibleIds.has(id)) {
      return;
    }
    this.forceVisibleIds.add(id);
    this.notify();
  }

  isForceVisible(id: string): boolean {
    return this.forceVisibleIds.has(id);
  }

  notifyIntersectionState(id: string, isIntersecting: boolean): void {
    if (isIntersecting) {
      // IO has caught up; the force override is no longer needed.
      // No notify(): the caller's own intersection-driven render is
      // already in flight.
      this.forceVisibleIds.delete(id);
    }
    this.scheduleTick();
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

    let granted = false;
    for (const { id } of candidates.slice(0, slotsAvailable)) {
      this.prefetchedIds.add(id);
      granted = true;
    }

    if (granted) {
      this.notify();
    }
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }
}
