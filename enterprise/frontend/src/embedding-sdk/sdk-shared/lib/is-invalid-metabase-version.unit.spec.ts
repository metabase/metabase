import { isInvalidMetabaseVersion } from "embedding-sdk/sdk-shared/lib/is-invalid-metabase-version";

describe.each([
  {
    version: "vLOCAL_DEV",
    expectedResult: true,
  },
  {
    version: "vUNKNOWN",
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
