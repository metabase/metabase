import { renderHook } from "@testing-library/react";

import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";

import { sdkBundleExports } from "./sdk-bundle-exports";

// The exports are built when this module loads, so the check is faked rather
// than the React version: the real module cannot be re-loaded per test.
jest.mock("embedding-sdk-bundle/lib/host-react-version", () => ({
  ...jest.requireActual("embedding-sdk-bundle/lib/host-react-version"),
  isHostReactVersionSupported: () => false,
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getBuildInfo: jest.fn(),
}));

const UNSUPPORTED_REACT_MESSAGE_START =
  "The Metabase modular embedding SDK requires React";

describe("sdkBundleExports on an unsupported host React", () => {
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Versions the real hook warns about, so silence here means it never ran.
    // Its own spec covers the warning it prints on a supported React.
    // Unjustified type cast. FIXME
    (getBuildInfo as jest.Mock)
      .mockReturnValueOnce({ version: "0.55.10" })
      .mockReturnValueOnce({ version: "v1.52.0" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("publishes a useLogVersionInfo that reports the React version instead of the SDK versions", () => {
    renderHook(() => sdkBundleExports.useLogVersionInfo());

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(UNSUPPORTED_REACT_MESSAGE_START),
    );
  });
});
