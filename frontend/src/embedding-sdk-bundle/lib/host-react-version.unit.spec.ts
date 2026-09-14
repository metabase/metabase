import {
  getHostReactMajorVersion,
  isHostReactVersionSupported,
} from "./host-react-version";

let mockReactVersion: string | undefined;

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  get version() {
    return mockReactVersion;
  },
}));

describe("getHostReactMajorVersion", () => {
  it.each([
    ["18.3.1", 18],
    ["19.0.0", 19],
    ["19.1.0-canary-abc", 19],
  ])("returns the major of %s", (version, major) => {
    mockReactVersion = version;

    expect(getHostReactMajorVersion()).toBe(major);
  });

  it("returns null when the host React version is unknown", () => {
    mockReactVersion = undefined;

    expect(getHostReactMajorVersion()).toBeNull();
  });
});

describe("isHostReactVersionSupported", () => {
  it("supports React 18 while the minimum is 18", () => {
    mockReactVersion = "18.3.1";

    expect(isHostReactVersionSupported(18)).toBe(true);
  });

  it("does not support React 18 once the minimum is 19", () => {
    mockReactVersion = "18.3.1";

    expect(isHostReactVersionSupported(19)).toBe(false);
  });

  it("supports React 19 when the minimum is 19", () => {
    mockReactVersion = "19.0.0";

    expect(isHostReactVersionSupported(19)).toBe(true);
  });

  it("treats an unknown host React version as supported", () => {
    mockReactVersion = undefined;

    expect(isHostReactVersionSupported(19)).toBe(true);
  });
});
