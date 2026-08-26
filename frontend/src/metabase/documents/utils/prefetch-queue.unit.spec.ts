import {
  MAX_CONCURRENT_PREFETCHES,
  PrefetchQueueStore,
} from "./prefetch-queue";

function makeElement(top: number, height = 100): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => new DOMRect(0, top, 100, height);
  return el;
}

/**
 * A synchronous fake idle scheduler: each scheduled callback runs
 * immediately when `flush()` is invoked, mirroring what
 * requestIdleCallback would eventually do.
 */
function makeFakeScheduler() {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();

  return {
    schedule(cb: () => void) {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    },
    cancel(handle: number) {
      pending.delete(handle);
    },
    flush() {
      const cbs = Array.from(pending.values());
      pending.clear();
      for (const cb of cbs) {
        cb();
      }
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

describe("PrefetchQueueStore", () => {
  let scheduler: ReturnType<typeof makeFakeScheduler>;
  let queue: PrefetchQueueStore;

  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1000,
    });
    scheduler = makeFakeScheduler();
    queue = new PrefetchQueueStore(scheduler);
  });

  function register(id: string, top: number, isInViewport = false) {
    const el = makeElement(top);
    return queue.register({
      id,
      getElement: () => el,
      isInViewport: () => isInViewport,
    });
  }

  it("grants tickets only after the idle scheduler fires", () => {
    register("a", 2000);
    expect(queue.hasTicket("a")).toBe(false);
    scheduler.flush();
    expect(queue.hasTicket("a")).toBe(true);
  });

  it("sorts off-screen candidates by distance to viewport center", () => {
    register("far", 10_000);
    register("near", 1200);
    register("farthest", 20_000);
    register("middle", 5000);
    scheduler.flush();

    expect(queue.hasTicket("near")).toBe(true);
    expect(queue.hasTicket("middle")).toBe(true);
    expect(queue.hasTicket("far")).toBe(true);
    expect(queue.hasTicket("farthest")).toBe(false);
  });

  it("caps tickets at MAX_CONCURRENT_PREFETCHES per idle tick when no slots are taken", () => {
    const ids = Array.from(
      { length: MAX_CONCURRENT_PREFETCHES + 2 },
      (_, i) => `card-${i}`,
    );
    ids.forEach((id, i) => register(id, 2000 + i * 1000));
    scheduler.flush();

    const granted = ids.filter((id) => queue.hasTicket(id));
    expect(granted).toHaveLength(MAX_CONCURRENT_PREFETCHES);
  });

  it("skips cards that are currently in viewport", () => {
    register("in-view", 500, true);
    register("off-screen", 2000);
    scheduler.flush();

    expect(queue.hasTicket("in-view")).toBe(false);
    expect(queue.hasTicket("off-screen")).toBe(true);
  });

  it("respects loading slots: in-flight loads reduce available slots", () => {
    const ids = Array.from(
      { length: MAX_CONCURRENT_PREFETCHES + 2 },
      (_, i) => `card-${i}`,
    );
    ids.forEach((id, i) => register(id, 2000 + i * 1000));
    queue.reportLoading("loading-1", true);
    queue.reportLoading("loading-2", true);
    queue.reportLoading("loading-3", true);
    scheduler.flush();

    const granted = ids.filter((id) => queue.hasTicket(id));
    expect(granted).toHaveLength(0);
  });

  it("does nothing when network gating disables prefetching", () => {
    register("a", 2000);
    queue.setEnabled(false);
    scheduler.flush();

    expect(queue.hasTicket("a")).toBe(false);
  });

  it("notifies subscribers when tickets change", () => {
    const listener = jest.fn();
    queue.subscribe(listener);
    register("a", 2000);
    scheduler.flush();
    expect(listener).toHaveBeenCalled();
  });

  it("releases ticket on unregister", () => {
    const unregister = register("a", 2000);
    scheduler.flush();
    expect(queue.hasTicket("a")).toBe(true);
    unregister();
    expect(queue.hasTicket("a")).toBe(false);
  });

  it("coalesces multiple state changes into a single idle tick", () => {
    register("a", 2000);
    register("b", 3000);
    queue.notifyViewportChange();
    queue.reportLoading("a", false);

    expect(scheduler.pendingCount).toBe(1);
  });

  it("re-schedules a new tick after the previous one runs", () => {
    register("a", 2000);
    scheduler.flush();
    expect(scheduler.pendingCount).toBe(0);

    register("b", 3000);
    expect(scheduler.pendingCount).toBe(1);
  });
});
