import { getHostReactVersion } from "embedding-sdk-bundle/analytics/snowplow";

import { getHostReactMajorVersion } from "./host-react-version";

jest.mock("embedding-sdk-bundle/analytics/snowplow", () => ({
  getHostReactVersion: jest.fn(),
}));

describe("getHostReactMajorVersion", () => {
  it.each([
    ["18.3.1", 18],
    ["19.0.0", 19],
    ["19.1.0-canary-abc", 19],
  ])("returns the major of %s", (version, major) => {
    jest.mocked(getHostReactVersion).mockReturnValue(version);

    expect(getHostReactMajorVersion()).toBe(major);
  });

  it("returns null when the host React version is unknown", () => {
    jest.mocked(getHostReactVersion).mockReturnValue("unknown");

    expect(getHostReactMajorVersion()).toBeNull();
  });
});
