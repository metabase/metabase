import { isSdkVersionCompatibleWithMetabaseVersion } from "./version-utils";

const expectCompatibility = ({
  mbVersion,
  sdkVersion,
  expected,
}: {
  mbVersion: string;
  sdkVersion: string;
  expected: boolean;
}) => {
  it(`expect sdk version ${sdkVersion} and mb version ${mbVersion} to be ${expected ? "compatible" : "incompatible"}`, () => {
    expect(
      isSdkVersionCompatibleWithMetabaseVersion({
        mbVersion,
        sdkVersion,
      }),
    ).toBe(expected);
  });
};

describe('sdk version utils, naming used: "{0,1}.{major}.{minor}"', () => {
  describe('should return true only if the "major" version is the same', () => {
    expectCompatibility({
      mbVersion: "v0.52.10",
      sdkVersion: "0.52.10",
      expected: true,
    });
    expectCompatibility({
      mbVersion: "v1.50.10",
      sdkVersion: "0.51.10",
      expected: false,
    });
    expectCompatibility({
      mbVersion: "v1.50.10",
      sdkVersion: "0.53.10",
      expected: false,
    });
  });

  describe('should ignore "minors"', () => {
    expectCompatibility({
      mbVersion: "v1.50.10",
      sdkVersion: "0.50.11",
      expected: true,
    });

    expectCompatibility({
      mbVersion: "v1.50.10",
      sdkVersion: "0.50.9",
      expected: true,
    });
  });

  describe("sdk version 0.xx.yy should be compatible both with MB 0.xx.yy (OSS) and 1.xx.yy (EE)", () => {
    expectCompatibility({
      mbVersion: "v0.52.10",
      sdkVersion: "0.52.10",
      expected: true,
    });

    expectCompatibility({
      mbVersion: "v1.52.10",
      sdkVersion: "0.52.10",
      expected: true,
    });
  });

  describe("should ignore build tags like snapshot, alpha, beta, rc", () => {
    for (const tag of ["snapshot", "alpha", "beta", "rc", "X-NOT-EXISTING"]) {
      expectCompatibility({
        mbVersion: `v0.52.10-${tag}`,
        sdkVersion: "0.52.10",
        expected: true,
      });
    }
  });

  describe("should handle versions of the sdk wrapped in double quotes (metabase#50014)", () => {
    expectCompatibility({
      mbVersion: "v1.55.0",
      sdkVersion: '"0.55.0"',
      expected: true,
    });

    expectCompatibility({
      mbVersion: "v1.55.0",
      sdkVersion: '"0.54.0"',
      expected: false,
    });
  });
});
