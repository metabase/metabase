import { EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";

import {
  isInvalidMetabaseVersion,
  isSdkPackageCompatibleWithSdkBundle,
} from "./version-utils";

const expectCompatibility = ({
  sdkPackageVersion,
  sdkBundleVersion,
  expected,
}: {
  sdkPackageVersion: string;
  sdkBundleVersion: string;
  expected: boolean;
}) => {
  it(`expect sdk package version ${sdkPackageVersion} and sdk bundle version ${sdkBundleVersion} to be ${expected ? "compatible" : "incompatible"}`, () => {
    expect(
      isSdkPackageCompatibleWithSdkBundle({
        sdkPackageVersion,
        sdkBundleVersion,
      }),
    ).toBe(expected);
  });
};

describe("sdk version utils", () => {
  describe.each([
    {
      version: "vLOCAL_DEV",
      expectedResult: true,
    },
    {
      version: EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION,
      expectedResult: true,
    },
    {
      version: "v0.52.10-SNAPSHOT",
      expectedResult: true,
    },
    {
      version: "v1.50.10",
      expectedResult: false,
    },
    {
      version: "v1.50.10-rc",
      expectedResult: false,
    },
    {
      version: "v1.50.10-alpha",
      expectedResult: false,
    },
  ])("isInvalidMetabaseVersion", ({ version, expectedResult }) => {
    it(`should return ${expectedResult} for ${version}`, () => {
      expect(isInvalidMetabaseVersion(version)).toBe(expectedResult);
    });
  });

  describe('isSdkPackageCompatibleWithSdkBundle, naming used: "{0,1}.{major}.{minor}"', () => {
    describe('should return true only if the "major" version is the same', () => {
      expectCompatibility({
        sdkBundleVersion: "v0.52.10",
        sdkPackageVersion: "0.52.10",
        expected: true,
      });
      expectCompatibility({
        sdkBundleVersion: "v1.50.10",
        sdkPackageVersion: "0.51.10",
        expected: false,
      });
      expectCompatibility({
        sdkBundleVersion: "v1.50.10",
        sdkPackageVersion: "0.53.10",
        expected: false,
      });
    });

    describe('should ignore "minors"', () => {
      expectCompatibility({
        sdkBundleVersion: "v1.50.10",
        sdkPackageVersion: "0.50.11",
        expected: true,
      });

      expectCompatibility({
        sdkBundleVersion: "v1.50.10",
        sdkPackageVersion: "0.50.9",
        expected: true,
      });
    });

    describe("sdk version 0.xx.yy should be compatible both with MB 0.xx.yy (OSS) and 1.xx.yy (EE)", () => {
      expectCompatibility({
        sdkBundleVersion: "v0.52.10",
        sdkPackageVersion: "0.52.10",
        expected: true,
      });

      expectCompatibility({
        sdkBundleVersion: "v1.52.10",
        sdkPackageVersion: "0.52.10",
        expected: true,
      });
    });

    describe("should ignore build tags like snapshot, alpha, beta, rc", () => {
      for (const tag of ["snapshot", "alpha", "beta", "rc", "X-NOT-EXISTING"]) {
        expectCompatibility({
          sdkBundleVersion: `v0.52.10-${tag}`,
          sdkPackageVersion: "0.52.10",
          expected: true,
        });
      }
    });

    describe("should handle versions of the sdk wrapped in double quotes (metabase#50014)", () => {
      expectCompatibility({
        sdkBundleVersion: "v1.55.0",
        sdkPackageVersion: '"0.55.0"',
        expected: true,
      });

      expectCompatibility({
        sdkBundleVersion: "v1.55.0",
        sdkPackageVersion: '"0.54.0"',
        expected: false,
      });
    });
  });
});
