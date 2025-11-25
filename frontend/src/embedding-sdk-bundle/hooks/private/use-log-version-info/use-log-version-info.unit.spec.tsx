import { renderHook } from "@testing-library/react";
import "embedding-sdk-bundle";

import { EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";
import { useLogVersionInfo } from "embedding-sdk-bundle/hooks/private/use-log-version-info";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";

jest.mock("embedding-sdk-shared/hooks/use-lazy-selector", () => ({
  useLazySelector: jest.fn((selector) => selector()),
}));
jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getBuildInfo: jest.fn(),
}));

const setup = async ({
  sdkPackageVersion,
  sdkBundleVersion,
}: {
  sdkPackageVersion: string;
  sdkBundleVersion: string;
}) => {
  (getBuildInfo as jest.Mock).mockReturnValueOnce({
    version: sdkPackageVersion,
  });
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
});
