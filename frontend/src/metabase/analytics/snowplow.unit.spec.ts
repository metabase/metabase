import * as Snowplow from "@snowplow/browser-tracker";

import Settings from "metabase/utils/settings";

import { createSnowplowTracker } from "./snowplow";

jest.mock("@snowplow/browser-tracker", () => ({
  newTracker: jest.fn(),
  setCustomUrl: jest.fn(),
}));

const PAGE_URL = "https://metabase.example.com/embed/embedded-apps";

interface SetupOpts {
  snowplowEnabled?: boolean;
}

const setup = ({ snowplowEnabled = true }: SetupOpts = {}) => {
  jest.spyOn(Settings, "snowplowEnabled").mockReturnValue(snowplowEnabled);
  jest
    .spyOn(Settings, "snowplowUrl")
    .mockReturnValue("https://snowplow.example.com");
};

describe("createSnowplowTracker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports the given page URL instead of the document URL", () => {
    setup();

    createSnowplowTracker(() => undefined, { pageUrl: PAGE_URL });

    expect(Snowplow.newTracker).toHaveBeenCalledTimes(1);
    expect(Snowplow.setCustomUrl).toHaveBeenCalledTimes(1);
    expect(Snowplow.setCustomUrl).toHaveBeenCalledWith(PAGE_URL, ["sp"]);
  });

  it("keeps the document URL when no page URL is given", () => {
    setup();

    createSnowplowTracker(() => undefined);

    expect(Snowplow.newTracker).toHaveBeenCalledTimes(1);
    expect(Snowplow.setCustomUrl).not.toHaveBeenCalled();
  });

  it("does not create a tracker when Snowplow is disabled", () => {
    setup({ snowplowEnabled: false });

    createSnowplowTracker(() => undefined, { pageUrl: PAGE_URL });

    expect(Snowplow.newTracker).not.toHaveBeenCalled();
    expect(Snowplow.setCustomUrl).not.toHaveBeenCalled();
  });
});
