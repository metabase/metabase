import { api } from "metabase/api/client";
import { getPluginAssetUrl } from "metabase/visualizations/custom-visualizations/custom-viz-utils";

import { sdkCustomVizAssetManager } from "./initialize";

const okResponse = () =>
  ({
    ok: true,
    blob: async () => new Blob(["<svg/>"], { type: "image/svg+xml" }),
  }) as Response;

describe("sdkCustomVizAssetManager", () => {
  const createObjectURL = jest.fn(() => "blob:fake");
  const revokeObjectURL = jest.fn();

  beforeAll(() => {
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    createObjectURL.mockClear().mockReturnValue("blob:fake");
    revokeObjectURL.mockClear();
  });

  it("fetches the asset with auth and returns a same-origin blob: URL", async () => {
    const fetchSpy = jest.spyOn(api, "fetch").mockResolvedValue(okResponse());

    const url = await sdkCustomVizAssetManager.resolveCustomVizAssetUrl(
      1,
      "icon.svg",
    );

    expect(fetchSpy).toHaveBeenCalledWith({
      method: "GET",
      url: "/api/ee/custom-viz-plugin/1/asset",
      params: { path: "icon.svg" },
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(url).toBe("blob:fake");
  });

  it("reuses the cached blob on re-resolve, without refetching or revoking", async () => {
    const fetchSpy = jest.spyOn(api, "fetch").mockResolvedValue(okResponse());
    createObjectURL.mockReturnValue("blob:cached");

    const first = await sdkCustomVizAssetManager.resolveCustomVizAssetUrl(
      7,
      "icon.svg",
    );
    const second = await sdkCustomVizAssetManager.resolveCustomVizAssetUrl(
      7,
      "icon.svg",
    );

    expect(first).toBe("blob:cached");
    expect(second).toBe("blob:cached");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("falls back to the plain asset URL when the fetch rejects", async () => {
    jest.spyOn(api, "fetch").mockRejectedValue(new Error("network"));

    const url = await sdkCustomVizAssetManager.resolveCustomVizAssetUrl(
      2,
      "icon.svg",
    );

    expect(url).toBe(getPluginAssetUrl(2, "icon.svg"));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("falls back to the plain asset URL on a non-ok response", async () => {
    // A 404 with a usable blob(): proves the fallback comes from the !res.ok
    // check. If it were missing, the code would read blob() and build a url.
    jest.spyOn(api, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      blob: async () => new Blob(["<svg/>"], { type: "image/svg+xml" }),
    } as Response);

    const url = await sdkCustomVizAssetManager.resolveCustomVizAssetUrl(
      3,
      "icon.svg",
    );

    expect(url).toBe(getPluginAssetUrl(3, "icon.svg"));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("release revokes the stored blob for the plugin", async () => {
    jest.spyOn(api, "fetch").mockResolvedValue(okResponse());
    createObjectURL.mockReturnValue("blob:to-release");

    await sdkCustomVizAssetManager.resolveCustomVizAssetUrl(9, "icon.svg");
    sdkCustomVizAssetManager.releaseCustomVizAsset(9);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:to-release");
  });
});
