import { getCollectorHostUrl, initMetaplow } from "metabase/utils/metaplow";

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
