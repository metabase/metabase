import type * as SdkConfig from "metabase/embedding-sdk/config";
import { isDataApp, isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type * as IframeUtils from "metabase/utils/iframe";
import { isWithinIframe } from "metabase/utils/iframe";

import { shouldLoadTilesWithFetch } from "./LeafletTilePinMap";

jest.mock("metabase/embedding-sdk/config", () => ({
  ...jest.requireActual<typeof SdkConfig>("metabase/embedding-sdk/config"),
  isDataApp: jest.fn<boolean, []>(),
  isEmbeddingSdk: jest.fn<boolean, []>(),
}));

jest.mock("metabase/utils/iframe", () => ({
  ...jest.requireActual<typeof IframeUtils>("metabase/utils/iframe"),
  isWithinIframe: jest.fn<boolean, []>(),
}));

type SetupOpts = {
  sdk: boolean;
  iframe: boolean;
  dataApp: boolean;
};

const setup = ({ sdk, iframe, dataApp }: SetupOpts) => {
  jest.mocked(isEmbeddingSdk).mockReturnValue(sdk);
  jest.mocked(isWithinIframe).mockReturnValue(iframe);
  jest.mocked(isDataApp).mockReturnValue(dataApp);
};

describe("shouldLoadTilesWithFetch", () => {
  it("loads tiles with fetch in the SDK on the host page", () => {
    setup({ sdk: true, iframe: false, dataApp: false });
    expect(shouldLoadTilesWithFetch()).toBe(true);
  });

  it("loads tiles as plain images in Embed JS, the SDK inside an iframe", () => {
    setup({ sdk: true, iframe: true, dataApp: false });
    expect(shouldLoadTilesWithFetch()).toBe(false);
  });

  it("loads tiles with fetch in a data app's iframe, where only fetch reaches the page that shows it", () => {
    setup({ sdk: true, iframe: true, dataApp: true });
    expect(shouldLoadTilesWithFetch()).toBe(true);
  });

  it("loads tiles as plain images outside the SDK", () => {
    setup({ sdk: false, iframe: false, dataApp: false });
    expect(shouldLoadTilesWithFetch()).toBe(false);
  });
});
