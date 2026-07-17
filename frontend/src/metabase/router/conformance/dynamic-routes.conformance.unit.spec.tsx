import { runDynamicBoth } from "./test-utils";

describe("router/dynamic routes conformance", () => {
  it("matches v7 when an enabled feature route is reachable", async () => {
    const { facade, v7 } = await runDynamicBoth(
      { featureEnabled: true, pluginLoaded: true },
      "/feature",
    );
    expect(facade).toEqual(v7);
    expect(facade["rr-page"]).toBe("feature");
  });

  it("matches v7 by rendering the upsell when the feature is disabled", async () => {
    const { facade, v7 } = await runDynamicBoth(
      { featureEnabled: false, pluginLoaded: true },
      "/feature",
    );
    expect(facade).toEqual(v7);
    expect(facade["rr-page"]).toBe("upsell");
  });

  it("matches v7 by reaching an array-interpolated plugin route", async () => {
    const { facade, v7 } = await runDynamicBoth(
      { featureEnabled: true, pluginLoaded: true },
      "/ee/reports",
    );
    expect(facade).toEqual(v7);
    expect(facade["rr-page"]).toBe("ee-reports");
  });

  it("matches v7 by falling through to the catch-all when the EE bundle is absent", async () => {
    const { facade, v7 } = await runDynamicBoth(
      { featureEnabled: true, pluginLoaded: false },
      "/ee/reports",
    );
    expect(facade).toEqual(v7);
    expect(facade["rr-page"]).toBe("not-found");
  });

  it("matches v7 when deep-linking straight to a disabled-feature route", async () => {
    const { facade, v7 } = await runDynamicBoth(
      { featureEnabled: false, pluginLoaded: false },
      "/feature",
    );
    expect(facade).toEqual(v7);
    expect(facade["rr-page"]).toBe("upsell");
  });
});
