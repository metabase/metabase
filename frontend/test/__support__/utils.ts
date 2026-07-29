import type { CallLog } from "fetch-mock";

import { act, waitFor } from "./ui";

export const getNextId = (() => {
  let id = 0;
  return (startingId?: number) => {
    if (startingId) {
      id = startingId;
    }
    return ++id;
  };
})();

export async function delay(duration: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, duration));
  });
}

/**
 * Flushes pending microtasks/timers inside `act` so async effects (notably
 * floating-ui's `computePosition().then(flushSync(setState))` triggered by
 * Mantine popovers) settle before assertions. Use after opening a popover
 * to avoid the "not wrapped in act" warning.
 */
export async function waitForFloatingPosition() {
  await act(async () => {
    await Promise.resolve();
  });
}

const DEFAULT_BOUNDING_CLIENT_RECT: DOMRect = {
  height: 1,
  width: 1,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

/**
 * Mocks `HTMLElement.prototype.getBoundingClientRect` for the enclosing
 * `describe` block. Registers its own `beforeEach`/`afterEach`, so it only
 * needs to be called once in the `describe` body.
 *
 * jsdom always reports a zero-sized rect, which breaks `@tanstack/react-virtual`
 * (it renders no virtualized rows). See
 * https://github.com/TanStack/virtual/issues/29#issuecomment-657519522
 *
 * The default rect has a non-zero `width`/`height` but zeroed positions, so
 * floating-ui (used by Mantine popovers) does not compute a `NaN` offset from
 * otherwise-undefined `top`/`left`.
 */
export function mockGetBoundingClientRect(rect: Partial<DOMRect> = {}) {
  const original = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = jest.fn(() => ({
      ...DEFAULT_BOUNDING_CLIENT_RECT,
      ...rect,
    }));
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
  });
}

/** Waits for a request to have been made. It's useful to wait for a request and
 * then check its details separately, to make tests less flaky and to have
 * better failure messages (request arrived but wrong details vs request never
 * arrived)
 */
export const waitForRequest = async (requestFn: () => CallLog | undefined) => {
  try {
    // try catch to make jest show the line where waitForRequest was originally called
    await waitFor(() => {
      if (!requestFn()) {
        throw new Error("Request not found");
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      Error.captureStackTrace(error, waitForRequest);
    }
    throw error;
  }
};
