import {
  getHostReactMajorVersion,
  getUnsupportedReactVersionMessage,
  isHostReactVersionSupported,
  logUnsupportedReactVersionOnce,
} from "./host-react-version";

// MINIMUM_SUPPORTED_REACT_MAJOR_VERSION is 19, so React 18 stands in for an
// unsupported host throughout. When it moves to 20, move these versions up by one.
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
  it("does not support React 18", () => {
    mockReactVersion = "18.3.1";

    expect(isHostReactVersionSupported()).toBe(false);
  });

  it("supports React 19", () => {
    mockReactVersion = "19.0.0";

    expect(isHostReactVersionSupported()).toBe(true);
  });

  it("treats an unknown host React version as supported", () => {
    mockReactVersion = undefined;

    expect(isHostReactVersionSupported()).toBe(true);
  });
});

describe("getUnsupportedReactVersionMessage", () => {
  it("names the required and the detected React major versions", () => {
    mockReactVersion = "18.3.1";

    expect(getUnsupportedReactVersionMessage()).toBe(
      "The Metabase modular embedding SDK requires React 19 or newer, but this application is running React 18. Upgrade your application to React 19 to display embedded content.",
    );
  });
});

describe("logUnsupportedReactVersionOnce", () => {
  it("logs the unsupported React message once across calls", () => {
    mockReactVersion = "18.3.1";
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    logUnsupportedReactVersionOnce();
    logUnsupportedReactVersionOnce();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "The Metabase modular embedding SDK requires React 19 or newer, but this application is running React 18. Upgrade your application to React 19 to display embedded content.",
    );

    consoleError.mockRestore();
  });
});
