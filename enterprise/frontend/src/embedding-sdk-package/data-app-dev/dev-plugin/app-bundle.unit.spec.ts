import { build } from "vite";

import { createAppBundle } from "./app-bundle";

jest.mock("vite", () => ({ build: jest.fn() }));

const mockedBuild: jest.Mock = jest.mocked(build);

const rollupOutput = (code: string) => ({ output: [{ type: "chunk", code }] });

const flushPending = () => new Promise((resolve) => setTimeout(resolve, 0));

let onError: jest.Mock;

const setup = () => {
  onError = jest.fn();

  return createAppBundle({ root: "/app", mode: "development", onError });
};

beforeEach(() => {
  mockedBuild.mockReset();
  mockedBuild.mockResolvedValue(rollupOutput("built"));
});

describe("createAppBundle", () => {
  it("exposes the built chunk and when it was built", async () => {
    const bundle = setup();

    expect(await bundle.rebuild()).toBe(true);

    expect(bundle.code).toBe("built");
    expect(bundle.lastRebuildAt).toEqual(expect.any(Number));
  });

  it("reports a build failure instead of throwing at the dev server", async () => {
    const bundle = setup();
    mockedBuild.mockRejectedValue(new Error("syntax error in App.tsx"));

    // A failed build must leave the server running: the author fixes the file
    // and the next save rebuilds.
    expect(await bundle.rebuild()).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("syntax error in App.tsx"),
    );
    expect(bundle.lastRebuildAt).toBeNull();
  });

  it("keeps the last good bundle when a later build fails", async () => {
    const bundle = setup();
    await bundle.rebuild();

    mockedBuild.mockRejectedValue(new Error("nope"));
    await bundle.rebuild();

    // Serving nothing would blank the preview on every typo mid-edit.
    expect(bundle.code).toBe("built");
  });

  it("coalesces overlapping rebuilds into one repeat, notifying once", async () => {
    const bundle = setup();
    // One resolver per started build, so each can be finished independently.
    const finishBuild: Array<() => void> = [];
    mockedBuild.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishBuild.push(() => resolve(rollupOutput("built")));
        }),
    );

    const first = bundle.rebuild();
    await flushPending();

    // Three more saves land while the first build is still running.
    const overlapping = await Promise.all([
      bundle.rebuild(),
      bundle.rebuild(),
      bundle.rebuild(),
    ]);

    finishBuild[0]();
    await flushPending();
    finishBuild[1]();

    // A save during a build must not queue its own build — it marks the output
    // stale and the runner repeats once. Only the call that produced fresh
    // output reloads the page, so a burst of saves reloads it once, not once
    // per file.
    expect(overlapping).toEqual([false, false, false]);
    expect(await first).toBe(true);
    expect(mockedBuild).toHaveBeenCalledTimes(2);
  });

  it("does not repeat when nothing arrived during the build", async () => {
    const bundle = setup();

    await bundle.rebuild();
    await bundle.rebuild();

    expect(mockedBuild).toHaveBeenCalledTimes(2);
  });

  it("holds no code until something is built", () => {
    expect(setup().code).toBe("");
  });
});
