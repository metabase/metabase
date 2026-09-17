import {
  MINIMUM_SUPPORTED_REACT_MAJOR_VERSION,
  getHostReactMajorVersion,
  getUnsupportedReactVersionMessage,
  isHostReactVersionSupported,
  logUnsupportedReactVersionOnce,
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

describe("MINIMUM_SUPPORTED_REACT_MAJOR_VERSION", () => {
  it("matches the major of the React that Metabase is built with", () => {
    expect(MINIMUM_SUPPORTED_REACT_MAJOR_VERSION).toBe(
      parseInt(jest.requireActual("react").version, 10),
    );
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

describe("getUnsupportedReactVersionMessage", () => {
  it("names the required and the detected React major versions", () => {
    mockReactVersion = "17.0.2";

    expect(getUnsupportedReactVersionMessage()).toBe(
      `The Metabase modular embedding SDK requires React ${MINIMUM_SUPPORTED_REACT_MAJOR_VERSION} or newer, but this application is running React 17. Upgrade your application to React ${MINIMUM_SUPPORTED_REACT_MAJOR_VERSION} to display embedded content.`,
    );
  });
});

describe("logUnsupportedReactVersionOnce", () => {
  it("logs the unsupported React message once across calls", () => {
    mockReactVersion = "17.0.2";
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    logUnsupportedReactVersionOnce();
    logUnsupportedReactVersionOnce();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      getUnsupportedReactVersionMessage(),
    );

    consoleError.mockRestore();
  });
});
