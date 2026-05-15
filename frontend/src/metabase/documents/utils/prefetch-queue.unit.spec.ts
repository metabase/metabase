import { PrefetchQueueStore } from "./prefetch-queue";

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
    schedule: jest.fn((cb: () => void) => {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    }),
    cancel: jest.fn((handle: number) => {
      pending.delete(handle);
    }),
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
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1000,
    });
  });

  it("grants tickets only after the idle scheduler fires", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    queue.register({
      id: "a",
      getElement: () => makeElement(2000),
      isInViewport: () => false,
    });
    expect(queue.hasTicket("a")).toBe(false);
    scheduler.flush();
    expect(queue.hasTicket("a")).toBe(true);
  });

  it("sorts off-screen candidates by distance to viewport center", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    queue.register({
      id: "far",
      getElement: () => makeElement(10_000),
      isInViewport: () => false,
    });
    queue.register({
      id: "near",
      getElement: () => makeElement(1200),
      isInViewport: () => false,
    });
    queue.register({
      id: "middle",
      getElement: () => makeElement(5000),
      isInViewport: () => false,
    });
    scheduler.flush();

    // All three fit under the concurrency cap of 3, so all get tickets.
    expect(queue.hasTicket("near")).toBe(true);
    expect(queue.hasTicket("middle")).toBe(true);
    expect(queue.hasTicket("far")).toBe(true);
  });

  it("caps tickets at MAX_CONCURRENT_PREFETCHES per idle tick when no slots are taken", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    for (let i = 0; i < 5; i++) {
      queue.register({
        id: `card-${i}`,
        getElement: () => makeElement(2000 + i * 1000),
        isInViewport: () => false,
      });
    }
    scheduler.flush();

    const granted = ["card-0", "card-1", "card-2", "card-3", "card-4"].filter(
      (id) => queue.hasTicket(id),
    );
    expect(granted).toHaveLength(3);
  });

  it("skips cards that are currently in viewport", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    queue.register({
      id: "in-view",
      getElement: () => makeElement(500),
      isInViewport: () => true,
    });
    queue.register({
      id: "off-screen",
      getElement: () => makeElement(2000),
      isInViewport: () => false,
    });
    scheduler.flush();

    expect(queue.hasTicket("in-view")).toBe(false);
    expect(queue.hasTicket("off-screen")).toBe(true);
  });

  it("respects loading slots: in-flight loads reduce available slots", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    for (let i = 0; i < 5; i++) {
      queue.register({
        id: `card-${i}`,
        getElement: () => makeElement(2000 + i * 1000),
        isInViewport: () => false,
      });
    }
    queue.reportLoading("loading-1", true);
    queue.reportLoading("loading-2", true);
    queue.reportLoading("loading-3", true);
    scheduler.flush();

    const granted = ["card-0", "card-1", "card-2", "card-3", "card-4"].filter(
      (id) => queue.hasTicket(id),
    );
    expect(granted).toHaveLength(0);
  });

  it("does nothing when network gating disables prefetching", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    queue.register({
      id: "a",
      getElement: () => makeElement(2000),
      isInViewport: () => false,
    });
    queue.setEnabled(false);
    scheduler.flush();

    expect(queue.hasTicket("a")).toBe(false);
  });

  it("notifies subscribers when tickets change", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    const listener = jest.fn();
    queue.subscribe(listener);
    queue.register({
      id: "a",
      getElement: () => makeElement(2000),
      isInViewport: () => false,
    });
    scheduler.flush();
    expect(listener).toHaveBeenCalled();
  });

  it("releases ticket on unregister", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    const unregister = queue.register({
      id: "a",
      getElement: () => makeElement(2000),
      isInViewport: () => false,
    });
    scheduler.flush();
    expect(queue.hasTicket("a")).toBe(true);
    unregister();
    expect(queue.hasTicket("a")).toBe(false);
  });

  it("coalesces multiple state changes into a single idle tick", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    queue.register({
      id: "a",
      getElement: () => makeElement(2000),
      isInViewport: () => false,
    });
    queue.register({
      id: "b",
      getElement: () => makeElement(3000),
      isInViewport: () => false,
    });
    queue.notifyViewportChange();
    queue.reportLoading("a", false);

    expect(scheduler.pendingCount).toBe(1);
  });

  describe("forceVisible", () => {
    it("marks a card as force-visible and notifies subscribers", () => {
      const scheduler = makeFakeScheduler();
      const queue = new PrefetchQueueStore(scheduler);
      const listener = jest.fn();
      queue.subscribe(listener);

      queue.forceVisible("anchor-target");

      expect(queue.isForceVisible("anchor-target")).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it("auto-clears the force flag once intersection is reported", () => {
      const scheduler = makeFakeScheduler();
      const queue = new PrefetchQueueStore(scheduler);
      queue.forceVisible("anchor-target");
      expect(queue.isForceVisible("anchor-target")).toBe(true);

      queue.notifyIntersectionState("anchor-target", true);

      expect(queue.isForceVisible("anchor-target")).toBe(false);
    });

    it("does not clear the force flag while still off-screen", () => {
      const scheduler = makeFakeScheduler();
      const queue = new PrefetchQueueStore(scheduler);
      queue.forceVisible("anchor-target");

      queue.notifyIntersectionState("anchor-target", false);

      expect(queue.isForceVisible("anchor-target")).toBe(true);
    });

    it("clears the force flag on unregister", () => {
      const scheduler = makeFakeScheduler();
      const queue = new PrefetchQueueStore(scheduler);
      const unregister = queue.register({
        id: "anchor-target",
        getElement: () => makeElement(2000),
        isInViewport: () => false,
      });
      queue.forceVisible("anchor-target");
      expect(queue.isForceVisible("anchor-target")).toBe(true);

      unregister();

      expect(queue.isForceVisible("anchor-target")).toBe(false);
    });
  });

  it("re-schedules a new tick after the previous one runs", () => {
    const scheduler = makeFakeScheduler();
    const queue = new PrefetchQueueStore(scheduler);
    queue.register({
      id: "a",
      getElement: () => makeElement(2000),
      isInViewport: () => false,
    });
    scheduler.flush();
    expect(scheduler.pendingCount).toBe(0);

    queue.register({
      id: "b",
      getElement: () => makeElement(3000),
      isInViewport: () => false,
    });
    expect(scheduler.pendingCount).toBe(1);
  });
});
