/**
 * Step 2 verification for EMB-1616: confirm the bundle entry registers
 * `MetabotSubscriber` under `window.METABASE_EMBEDDING_SDK_BUNDLE._internal`.
 *
 * The bundle entry registers onto `window` as an import side effect, so the
 * dynamic import drives the registration.
 */
describe("embedding-sdk-bundle/index bundle registration", () => {
  it("exposes MetabotSubscriber under window.METABASE_EMBEDDING_SDK_BUNDLE._internal", async () => {
    await import("./index");

    const bundle = window.METABASE_EMBEDDING_SDK_BUNDLE;

    if (!bundle) {
      throw new Error("window.METABASE_EMBEDDING_SDK_BUNDLE was not defined");
    }

    expect(bundle._internal).toBeDefined();
    expect(typeof bundle._internal.MetabotSubscriber).toBe("function");
  });
});
