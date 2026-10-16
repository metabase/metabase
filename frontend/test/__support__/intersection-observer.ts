import { act } from "@testing-library/react";

type MockIntersectionObserverOptions = {
  /**
   * Report every observed element as intersecting right after `observe`, the
   * way a browser reports a newly observed element's intersection.
   */
  intersectOnObserve?: boolean;
};

/**
 * Replaces the default no-op IntersectionObserver stub (see
 * frontend/test/jest-setup.js) with a mock that captures the observer
 * callback so tests can drive intersection events.
 *
 * Call inside a `describe` block — it registers beforeEach/afterEach hooks
 * that install the mock and restore the original observer.
 */
export function setupMockIntersectionObserver({
  intersectOnObserve = false,
}: MockIntersectionObserverOptions = {}) {
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  let intersectionCallback: IntersectionObserverCallback | null = null;
  let observerOptions: IntersectionObserverInit | undefined;
  const observeMock = jest.fn<void, [Element]>();
  const disconnectMock = jest.fn();

  beforeEach(() => {
    intersectionCallback = null;
    observerOptions = undefined;
    observeMock.mockClear();
    disconnectMock.mockClear();

    globalThis.IntersectionObserver = class MockIntersectionObserver implements IntersectionObserver {
      constructor(
        private callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        intersectionCallback = callback;
        observerOptions = options;
      }

      root: Element | null = null;
      rootMargin = "";
      scrollMargin = "";
      thresholds: ReadonlyArray<number> = [];
      observe(target: Element) {
        observeMock(target);
        if (intersectOnObserve) {
          setTimeout(() =>
            this.callback([createIntersectingEntry(target)], this),
          );
        }
      }
      disconnect = disconnectMock;
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    };
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  function setIntersecting(isIntersecting: boolean) {
    act(() => {
      intersectionCallback?.(
        // Unjustified type cast. FIXME
        [{ isIntersecting } as IntersectionObserverEntry],
        // Unjustified type cast. FIXME
        {} as IntersectionObserver,
      );
    });
  }

  return {
    setIntersecting,
    observe: observeMock,
    disconnect: disconnectMock,
    getObserverOptions: () => observerOptions,
  };
}

function createIntersectingEntry(target: Element): IntersectionObserverEntry {
  const rect = target.getBoundingClientRect();
  return {
    target,
    isIntersecting: true,
    intersectionRatio: 1,
    boundingClientRect: rect,
    intersectionRect: rect,
    rootBounds: null,
    time: 0,
  };
}
