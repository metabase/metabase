import type * as HostReactVersion from "./host-react-version";
import { getHostReactMajorVersion } from "./host-react-version";

let mockReactVersion: string | undefined;

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  get version() {
    return mockReactVersion;
  },
}));

const originalMinimum = process.env.EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION;

afterEach(() => {
  process.env.EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION = originalMinimum;
});

// The minimum is read once when the module loads, so each case loads it fresh.
function loadWithMinimum(minimum: string) {
  process.env.EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION = minimum;

  let hostReactVersion: typeof HostReactVersion | undefined;
  jest.isolateModules(() => {
    hostReactVersion = jest.requireActual<typeof HostReactVersion>(
      "./host-react-version",
    );
  });

  if (!hostReactVersion) {
    throw new Error("host-react-version did not load");
  }

  return hostReactVersion;
}

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
  it("supports React 18 when the minimum is 18", () => {
    mockReactVersion = "18.3.1";

    expect(loadWithMinimum("18").isHostReactVersionSupported()).toBe(true);
  });

  it("does not support React 18 when the minimum is 19", () => {
    mockReactVersion = "18.3.1";

    expect(loadWithMinimum("19").isHostReactVersionSupported()).toBe(false);
  });

  it("supports React 19 when the minimum is 19", () => {
    mockReactVersion = "19.0.0";

    expect(loadWithMinimum("19").isHostReactVersionSupported()).toBe(true);
  });

  it("treats an unknown host React version as supported", () => {
    mockReactVersion = undefined;

    expect(loadWithMinimum("19").isHostReactVersionSupported()).toBe(true);
  });
});

describe("getUnsupportedReactVersionMessage", () => {
  it("names the required and the detected React major versions", () => {
    mockReactVersion = "18.3.1";

    expect(loadWithMinimum("19").getUnsupportedReactVersionMessage()).toBe(
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
    const { logUnsupportedReactVersionOnce } = loadWithMinimum("19");

    logUnsupportedReactVersionOnce();
    logUnsupportedReactVersionOnce();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "The Metabase modular embedding SDK requires React 19 or newer, but this application is running React 18. Upgrade your application to React 19 to display embedded content.",
    );

    consoleError.mockRestore();
  });
});
