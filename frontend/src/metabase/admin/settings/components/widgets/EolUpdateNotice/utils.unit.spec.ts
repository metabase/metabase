import {
  createMockMajorVersionSupport,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { getEolDate } from "./utils";

const VERSION = "v1.56.3";

describe("getEolDate", () => {
  it("returns null when major_version_support is missing", () => {
    expect(getEolDate(createMockVersionInfo(), VERSION)).toBeNull();
  });

  it("returns null when major_version_support is empty", () => {
    expect(
      getEolDate(createMockVersionInfo({ major_version_support: [] }), VERSION),
    ).toBeNull();
  });

  it("returns null when there is no row for the current major", () => {
    expect(
      getEolDate(
        createMockVersionInfo({
          major_version_support: [
            createMockMajorVersionSupport({ major: 54, eol: "2027-06-01" }),
          ],
        }),
        VERSION,
      ),
    ).toBeNull();
  });

  it("returns null when eol is not a valid date", () => {
    expect(
      getEolDate(
        createMockVersionInfo({
          major_version_support: [
            createMockMajorVersionSupport({ major: 56, eol: "not-a-date" }),
          ],
        }),
        VERSION,
      ),
    ).toBeNull();
  });

  it.each(["notaversion", "vLOCAL_DEV"])(
    "returns null for unparseable version %s",
    (tag) => {
      expect(
        getEolDate(
          createMockVersionInfo({
            major_version_support: [
              createMockMajorVersionSupport({ major: 56 }),
            ],
          }),
          tag,
        ),
      ).toBeNull();
    },
  );

  it("returns UTC midnight of the matching eol date", () => {
    const eolDate = getEolDate(
      createMockVersionInfo({
        major_version_support: [
          createMockMajorVersionSupport({ major: 56, eol: "2027-06-01" }),
        ],
      }),
      VERSION,
    );

    expect(eolDate?.toISOString()).toBe("2027-06-01T00:00:00.000Z");
  });

  it("uses the latest eol when the same major appears more than once", () => {
    const eolDate = getEolDate(
      createMockVersionInfo({
        major_version_support: [
          createMockMajorVersionSupport({ major: 56, eol: "2027-06-01" }),
          createMockMajorVersionSupport({ major: 54, eol: "2028-01-01" }),
          createMockMajorVersionSupport({ major: 56, eol: "2027-12-01" }),
        ],
      }),
      VERSION,
    );

    expect(eolDate?.toISOString()).toBe("2027-12-01T00:00:00.000Z");
  });
});
