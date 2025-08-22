import { renderHook } from "@testing-library/react";
import "embedding-sdk-bundle/bundle";

import { useLogVersionInfo } from "embedding-sdk-bundle/hooks/private/use-log-version-info";
import { getEmbeddingSdkPackageBuildData } from "embedding-sdk-bundle/lib/get-embedding-sdk-package-build-data";
import { getMetabaseInstanceVersion } from "embedding-sdk-bundle/store/selectors";

jest.mock("embedding-sdk-bundle/sdk-shared/hooks/use-lazy-selector", () => ({
  useLazySelector: jest.fn((selector) => selector()),
}));
jest.mock(
  "embedding-sdk-bundle/lib/get-embedding-sdk-package-build-data",
  () => ({
    getEmbeddingSdkPackageBuildData: jest.fn(),
  }),
);
jest.mock("embedding-sdk-bundle/store/selectors", () => ({
  ...jest.requireActual("embedding-sdk-bundle/store/selectors"),
  getMetabaseInstanceVersion: jest.fn(),
}));

const setup = async ({
  sdkVersion,
  mbVersion,
}: {
  sdkVersion: string;
  mbVersion: string;
}) => {
  (getEmbeddingSdkPackageBuildData as jest.Mock).mockReturnValue({
    version: sdkVersion,
  });
  (getMetabaseInstanceVersion as jest.Mock).mockReturnValue(mbVersion);

  renderHook(() => useLogVersionInfo());
};

let consoleWarnSpy: jest.SpyInstance;

const getWarnMessages = (): string[] =>
  consoleWarnSpy.mock.calls.map((callArguments) => callArguments.join(" "));

describe("useLogVersionInfo", () => {
  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (getEmbeddingSdkPackageBuildData as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("SDK version compatibility", () => {
    it("should show a message when the SDK version is not compatible with the Metabase version", async () => {
      await setup({ sdkVersion: "0.52.10", mbVersion: "v1.55.0" });

      expect(
        getWarnMessages().filter((message) =>
          message.includes(
            "SDK package version 0.52.10 is not compatible with SDK bundle version v1.55.0, this might cause issues.",
          ),
        ),
      ).toHaveLength(1);
    });

    it("should not show a warning when the SDK version is compatible with the Metabase version", async () => {
      await setup({ sdkVersion: "0.55.10", mbVersion: "v1.55.1" });

      expect(
        getWarnMessages().filter((message) =>
          message.includes("is not compatible"),
        ),
      ).toHaveLength(0);
    });

    it("should not show the warning when the sdk version is unknown", async () => {
      await setup({ sdkVersion: "unknown", mbVersion: "v1.55.1" });

      expect(
        getWarnMessages().filter((message) =>
          message.includes("is not compatible"),
        ),
      ).toHaveLength(0);
    });
  });
});
