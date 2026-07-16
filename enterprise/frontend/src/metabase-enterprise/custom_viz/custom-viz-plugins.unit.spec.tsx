import { api } from "metabase/api/client";
import type { CustomVizPluginRuntime } from "metabase-types/api";

import { loadCustomVizPlugin } from "./custom-viz-plugins";
import { createPluginSandbox } from "./sandbox";

jest.mock("./sandbox", () => ({
  createPluginSandbox: jest.fn(),
}));

function makePlugin(
  overrides: Partial<CustomVizPluginRuntime> &
    Pick<CustomVizPluginRuntime, "id" | "identifier">,
): CustomVizPluginRuntime {
  return {
    display_name: "Test Plugin",
    icon: null,
    bundle_url: `/api/ee/custom-viz-plugin/${overrides.id}/bundle`,
    bundle_hash: "hash-1",
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function okBundleResponse(): Response {
  // Unjustified type cast. FIXME
  return {
    ok: true,
    status: 200,
    text: async () => "export default () => ({ mount: () => {} });",
  } as Response;
}

const mountFn = jest.fn();
const factory = () => ({ mount: mountFn });
const sandboxEnv = { evaluate: jest.fn().mockReturnValue(factory) };

const createPluginSandboxMock = jest.mocked(createPluginSandbox);

describe("loadCustomVizPlugin concurrency dedup", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    createPluginSandboxMock.mockReset().mockResolvedValue(sandboxEnv);
  });

  it("creates the sandbox only once for two concurrent calls with the same id+hash", async () => {
    const plugin = makePlugin({ id: 101, identifier: "concurrent-plugin" });
    const fetchDeferred = createDeferred<Response>();
    const fetchSpy = jest
      .spyOn(api, "fetch")
      .mockReturnValue(fetchDeferred.promise);

    const p1 = loadCustomVizPlugin(plugin);
    const p2 = loadCustomVizPlugin(plugin);

    // Second call should reuse the in-flight promise instead of fetching again.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchDeferred.resolve(okBundleResponse());

    const [id1, id2] = await Promise.all([p1, p2]);

    expect(id1).toBe(id2);
    expect(id1).toBe("custom:concurrent-plugin");
    expect(createPluginSandboxMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses the in-flight dedup when cacheBustSuffix is set (creates fresh)", async () => {
    const plugin = makePlugin({ id: 102, identifier: "dev-plugin" });
    const fetchDeferred1 = createDeferred<Response>();
    const fetchDeferred2 = createDeferred<Response>();
    const fetchSpy = jest
      .spyOn(api, "fetch")
      .mockReturnValueOnce(fetchDeferred1.promise)
      .mockReturnValueOnce(fetchDeferred2.promise);

    // Plain call stays in-flight (unresolved) while a dev-reload call with
    // cacheBustSuffix comes in; it must not be deduped against the plain call.
    const p1 = loadCustomVizPlugin(plugin);
    const p2 = loadCustomVizPlugin(plugin, { cacheBustSuffix: "?t=123" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchDeferred1.resolve(okBundleResponse());
    fetchDeferred2.resolve(okBundleResponse());

    await Promise.all([p1, p2]);

    expect(createPluginSandboxMock).toHaveBeenCalledTimes(2);
  });

  it("a sequential call after the first resolved hits the loadedPlugins fast path", async () => {
    const plugin = makePlugin({ id: 103, identifier: "seq-plugin" });
    jest.spyOn(api, "fetch").mockResolvedValue(okBundleResponse());

    const id1 = await loadCustomVizPlugin(plugin);
    const id2 = await loadCustomVizPlugin(plugin);

    expect(id1).toBe(id2);
    expect(createPluginSandboxMock).toHaveBeenCalledTimes(1);
  });
});
