import { getCollectorHostUrl, initMetaplow } from "metabase/utils/metaplow";

// The route initializes its trackers at module scope, so importing it is what is under test. One import per spec
// file: the module tree includes the CLJS build, which cannot be re-evaluated after `jest.resetModules()`.
jest.mock("metabase/utils/metaplow", () => ({
  getCollectorHostUrl: jest.fn(() => "https://collector.example.com/api"),
  initMetaplow: jest.fn(),
  trackMetaplowEvent: jest.fn(),
  trackMetaplowPageView: jest.fn(),
}));

describe("SdkIframeEmbedRoute analytics", () => {
  it("initializes Metabase Track for the iframe leg, posting to the collector directly", async () => {
    await import("./SdkIframeEmbedRoute");

    expect(getCollectorHostUrl).toHaveBeenCalled();
    expect(initMetaplow).toHaveBeenCalledWith(
      expect.objectContaining({
        hostUrl: "https://collector.example.com/api",
        getUserId: expect.any(Function),
      }),
    );
  });
});
