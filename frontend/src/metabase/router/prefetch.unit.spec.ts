import { prefetchPage, registerPagePrefetch } from "./prefetch";

// The registry is module state that no test can clear, so every test registers
// its own path. That is closer to how the app uses it anyway: registration
// happens once, when a routes module is first imported.
let nextId = 0;
const uniquePath = () => `/prefetch-spec-${nextId++}`;

describe("prefetchPage", () => {
  it("loads a page whose prefix matches", () => {
    const path = uniquePath();
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, load);

    prefetchPage(path);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("matches anything below the registered prefix", () => {
    const path = uniquePath();
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, load);

    prefetchPage(`${path}/42`);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("matches only the whole path when the registration is exact", () => {
    const path = uniquePath();
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, load, { exact: true });

    prefetchPage(`${path}/42`);
    expect(load).not.toHaveBeenCalled();

    prefetchPage(path);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("leaves an unrelated path alone", () => {
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(uniquePath(), load);

    prefetchPage(uniquePath());

    expect(load).not.toHaveBeenCalled();
  });

  it("asks for a page once however often it is hovered", () => {
    const path = uniquePath();
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, load);

    prefetchPage(path);
    prefetchPage(path);
    prefetchPage(`${path}/42`);

    expect(load).toHaveBeenCalledTimes(1);
  });

  // A route that renders one page or another depending on the license registers
  // both against the same path.
  it("loads every page registered for the same prefix", () => {
    const path = uniquePath();
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, first);
    registerPagePrefetch(path, second);

    prefetchPage(path);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  // Nothing renders a prefetch failure, so the next hover has to be able to try
  // again. Otherwise one dropped request leaves the page unfetchable ahead of
  // time for the rest of the session.
  it("retries after a failed load", async () => {
    const path = uniquePath();
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    registerPagePrefetch(path, load);

    prefetchPage(path);
    await Promise.resolve();

    prefetchPage(path);

    expect(load).toHaveBeenCalledTimes(2);
  });
});
