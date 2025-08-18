import { getMajorVersion } from "./get-major-version";

describe("getMajorVersion", () => {
  describe.each([
    ["v0.46.2", 46],
    ["1.23.4", 23],
    ["2.5.0-beta1", 5],
    ["10.99.0-rc2", 99],
    ["3.7.1", 7],
    ["v4.8.0", 8],
    ["v1.2.3-beta4", 2],
    ["9.8.7-snapshot", 8],
    ["5.6.7-alpha123", 6],
  ])("getMajorVersion('%s')", (input, expected) => {
    it(`should return ${expected}`, () => {
      expect(getMajorVersion(input)).toBe(expected);
    });
  });

  describe.each([["v42"], ["123"], ["foo"], ["v"], [""]])(
    "getMajorVersion('%s') invalid cases",
    (input) => {
      it("should return null", () => {
        expect(getMajorVersion(input)).toBeNull();
      });
    },
  );
});
