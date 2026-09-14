import { getHostReactVersion } from "embedding-sdk-bundle/analytics/snowplow";

import {
  getHostReactMajorVersion,
  isHostReactVersionSupported,
} from "./host-react-version";

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

describe("isHostReactVersionSupported", () => {
  it("supports React 18 while the minimum is 18", () => {
    jest.mocked(getHostReactVersion).mockReturnValue("18.3.1");

    expect(isHostReactVersionSupported(18)).toBe(true);
  });

  it("does not support React 18 once the minimum is 19", () => {
    jest.mocked(getHostReactVersion).mockReturnValue("18.3.1");

    expect(isHostReactVersionSupported(19)).toBe(false);
  });

  it("supports React 19 when the minimum is 19", () => {
    jest.mocked(getHostReactVersion).mockReturnValue("19.0.0");

    expect(isHostReactVersionSupported(19)).toBe(true);
  });

  it("treats an unknown host React version as supported", () => {
    jest.mocked(getHostReactVersion).mockReturnValue("unknown");

    expect(isHostReactVersionSupported(19)).toBe(true);
  });
});
