import { renderHook } from "@testing-library/react";
import "embedding-sdk-bundle";

import { EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";
import { useLogVersionInfo } from "embedding-sdk-bundle/hooks/private/use-log-version-info";
import { getIsLocalhost } from "embedding-sdk-bundle/lib/get-is-localhost";
import { getHostReactMajorVersion } from "embedding-sdk-bundle/lib/host-react-version";
import { USAGE_PROBLEM_MESSAGES } from "embedding-sdk-bundle/lib/usage-problem";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import { isHostAppInDevMode } from "embedding-sdk-shared/lib/is-host-app-in-dev-mode";

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getBuildInfo: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/lib/get-is-localhost", () => ({
  getIsLocalhost: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/lib/host-react-version", () => ({
  getHostReactMajorVersion: jest.fn(),
}));

jest.mock("embedding-sdk-shared/lib/is-host-app-in-dev-mode", () => ({
  isHostAppInDevMode: jest.fn(),
}));

const setup = async ({
  sdkPackageVersion,
  sdkBundleVersion,
}: {
  sdkPackageVersion: string;
  sdkBundleVersion: string;
}) => {
  // Unjustified type cast. FIXME
  (getBuildInfo as jest.Mock).mockReturnValueOnce({
    version: sdkPackageVersion,
  });
  // Unjustified type cast. FIXME
  (getBuildInfo as jest.Mock).mockReturnValueOnce({
    version: sdkBundleVersion,
  });

  renderHook(() => useLogVersionInfo());
};

let consoleWarnSpy: jest.SpyInstance;

const getWarnMessages = (): string[] =>
  consoleWarnSpy.mock.calls.map((callArguments) => callArguments.join(" "));

describe("useLogVersionInfo", () => {
  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("SDK version compatibility", () => {
    it("should show a message when the SDK version is not compatible with the Metabase version", async () => {
      await setup({
        sdkPackageVersion: "0.55.10",
        sdkBundleVersion: "v1.52.0",
      });

      expect(
        getWarnMessages().filter((message) =>
          message.includes(
            "SDK package version 0.55.10 is not compatible with SDK bundle version v1.52.0, this might cause issues.",
          ),
        ),
      ).toHaveLength(1);
    });

    it("should not show a warning when the SDK version is compatible with the Metabase version", async () => {
      await setup({
        sdkPackageVersion: "0.52.10",
        sdkBundleVersion: "v1.55.1",
      });

      expect(
        getWarnMessages().filter((message) =>
          message.includes("is not compatible"),
        ),
      ).toHaveLength(0);
    });

    it("should not show the warning when the sdk bundle is unknown", async () => {
      await setup({
        sdkPackageVersion: "0.55.10",
        sdkBundleVersion: EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION,
      });

      expect(
        getWarnMessages().filter((message) =>
          message.includes("is not compatible"),
        ),
      ).toHaveLength(0);
    });
  });

  describe("React 18 deprecation", () => {
    const setupReactVersion = ({
      hostReactMajorVersion,
      isLocalhost = false,
      isHostAppInDevelopmentMode = false,
    }: {
      hostReactMajorVersion: number;
      isLocalhost?: boolean;
      isHostAppInDevelopmentMode?: boolean;
    }) => {
      jest
        .mocked(getHostReactMajorVersion)
        .mockReturnValue(hostReactMajorVersion);
      jest.mocked(getIsLocalhost).mockReturnValue(isLocalhost);
      jest
        .mocked(isHostAppInDevMode)
        .mockReturnValue(isHostAppInDevelopmentMode);

      renderHook(() => useLogVersionInfo());
    };

    const getReact18Warnings = () =>
      getWarnMessages().filter((message) =>
        message.includes(USAGE_PROBLEM_MESSAGES.REACT_18_DEPRECATED),
      );

    it("warns on a production host when the host app runs React 18", () => {
      setupReactVersion({ hostReactMajorVersion: 18 });

      const warnings = getReact18Warnings();

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(
        "https://www.metabase.com/docs/latest/embedding/sdk/introduction#modular-embedding-sdk-prerequisites",
      );
    });

    it("leaves the warning to the usage problem on localhost", () => {
      setupReactVersion({ hostReactMajorVersion: 18, isLocalhost: true });

      expect(getReact18Warnings()).toHaveLength(0);
    });

    it("leaves the warning to the usage problem when the host app is in development mode", () => {
      setupReactVersion({
        hostReactMajorVersion: 18,
        isHostAppInDevelopmentMode: true,
      });

      expect(getReact18Warnings()).toHaveLength(0);
    });

    it("does not warn when the host app runs React 19", () => {
      setupReactVersion({ hostReactMajorVersion: 19 });

      expect(getReact18Warnings()).toHaveLength(0);
    });
  });
});
