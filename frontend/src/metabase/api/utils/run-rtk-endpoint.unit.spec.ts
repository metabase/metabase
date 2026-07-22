import { runRtkEndpoint } from "./run-rtk-endpoint";

type FakeAction = {
  unwrap: jest.Mock;
  unsubscribe: jest.Mock;
  abort: jest.Mock;
};

const setup = (unwrapImpl: () => Promise<unknown>) => {
  const action: FakeAction = {
    unwrap: jest.fn(unwrapImpl),
    unsubscribe: jest.fn(),
    abort: jest.fn(),
  };
  const initiate = jest.fn(() => action);
  const dispatch = jest.fn((thunk) => thunk);
  const endpoint = { initiate };

  return { action, initiate, dispatch, endpoint };
};

describe("runRtkEndpoint", () => {
  it("returns the unwrapped result and cleans up the subscription", async () => {
    const { action, dispatch, endpoint } = setup(() =>
      Promise.resolve({ id: 1 }),
    );

    const result = await runRtkEndpoint({ id: 1 }, dispatch, endpoint);

    expect(result).toEqual({ id: 1 });
    expect(action.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("aborts the in-flight request when the signal fires", async () => {
    const controller = new AbortController();
    const { action, dispatch, endpoint } = setup(
      () =>
        new Promise((resolve) => {
          controller.signal.addEventListener("abort", () =>
            resolve({ aborted: true }),
          );
        }),
    );

    const promise = runRtkEndpoint({ id: 1 }, dispatch, endpoint, {
      signal: controller.signal,
    });
    controller.abort();
    await promise;

    expect(action.abort).toHaveBeenCalledTimes(1);
    expect(action.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("aborts immediately when given an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const { action, dispatch, endpoint } = setup(() =>
      Promise.resolve({ id: 1 }),
    );

    await runRtkEndpoint({ id: 1 }, dispatch, endpoint, {
      signal: controller.signal,
    });

    expect(action.abort).toHaveBeenCalledTimes(1);
  });

  it("does not abort when no signal fires", async () => {
    const controller = new AbortController();
    const { action, dispatch, endpoint } = setup(() =>
      Promise.resolve({ id: 1 }),
    );

    await runRtkEndpoint({ id: 1 }, dispatch, endpoint, {
      signal: controller.signal,
    });

    expect(action.abort).not.toHaveBeenCalled();
  });
});
