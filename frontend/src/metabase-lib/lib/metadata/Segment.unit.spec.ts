// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Segment from "./Segment";
import Base from "./Base";
describe("Segment", () => {
  describe("instantiation", () => {
    it("should create an instance of Segment", () => {
      expect(new Segment()).toBeInstanceOf(Segment);
    });
    it("should add `object` props to the instance (because it extends Base)", () => {
      expect(new Segment()).toBeInstanceOf(Base);
      expect(
        new Segment({
          foo: "bar",
        }),
      ).toHaveProperty("foo", "bar");
    });
  });
  describe("displayName", () => {
    it("should return the `name` property found on the instance", () => {
      expect(
        new Segment({
          name: "foo",
        }).displayName(),
      ).toBe("foo");
    });
  });
  describe("filterClause", () => {
    it("should return a filter clause", () => {
      expect(
        new Segment({
          id: 123,
        }).filterClause(),
      ).toEqual(["segment", 123]);
    });
  });
  describe("isActive", () => {
    it("should return true if the segment is not archived", () => {
      expect(
        new Segment({
          archived: false,
        }).isActive(),
      ).toBe(true);
    });
    it("should return false if the segment is archived", () => {
      expect(
        new Segment({
          archived: true,
        }).isActive(),
      ).toBe(false);
    });
  });
});
