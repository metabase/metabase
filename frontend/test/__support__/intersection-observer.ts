import { act } from "@testing-library/react";

/**
 * Replaces the default no-op IntersectionObserver stub (see
 * frontend/test/jest-setup.js) with a mock that captures the observer
 * callback so tests can drive intersection events.
 *
 * Call inside a `describe` block — it registers beforeEach/afterEach hooks
 * that install the mock and restore the original observer.
 */
export function setupMockIntersectionObserver() {
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  let intersectionCallback: IntersectionObserverCallback | null = null;
  let observerOptions: IntersectionObserverInit | undefined;
  const observeMock = jest.fn();
  const disconnectMock = jest.fn();

  beforeEach(() => {
    intersectionCallback = null;
    observerOptions = undefined;
    observeMock.mockClear();
    disconnectMock.mockClear();

    globalThis.IntersectionObserver = class MockIntersectionObserver implements IntersectionObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        intersectionCallback = callback;
        observerOptions = options;
      }

      root: Element | null = null;
      rootMargin = "";
      scrollMargin = "";
      thresholds: ReadonlyArray<number> = [];
      observe = observeMock;
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
        [{ isIntersecting } as IntersectionObserverEntry],
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
