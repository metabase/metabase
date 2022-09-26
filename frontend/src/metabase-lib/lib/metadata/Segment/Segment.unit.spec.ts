import Base from "../Base";
import Database from "../Database";
import Table from "../Table";
import Segment from "./Segment";

const DEFAULT_SEGMENT = {
  name: "default-segment",
  description: "Default segment description",
  database: new Database(),
  table: new Table(),
  id: 1,
  archived: true,
};

describe("Segment", () => {
  describe("instantiation", () => {
    it("should create an instance of Segment", () => {
      expect(new Segment(DEFAULT_SEGMENT)).toBeInstanceOf(Segment);
    });

    it("should add `object` props to the instance (because it extends Base)", () => {
      expect(new Segment(DEFAULT_SEGMENT)).toBeInstanceOf(Base);
      expect(
        new Segment({
          ...DEFAULT_SEGMENT,
          foo: "bar",
        }),
      ).toHaveProperty("foo", "bar");
    });
  });

  describe("displayName", () => {
    it("should return the `name` property found on the instance", () => {
      expect(
        new Segment({
          ...DEFAULT_SEGMENT,
          name: "foo",
        }).displayName(),
      ).toBe("foo");
    });
  });

  describe("filterClause", () => {
    it("should return a filter clause", () => {
      expect(
        new Segment({
          ...DEFAULT_SEGMENT,
          id: 123,
        }).filterClause(),
      ).toEqual(["segment", 123]);
    });
  });

  describe("isActive", () => {
    it("should return true if the segment is not archived", () => {
      expect(
        new Segment({
          ...DEFAULT_SEGMENT,
          archived: false,
        }).isActive(),
      ).toBe(true);
    });

    it("should return false if the segment is archived", () => {
      expect(
        new Segment({
          ...DEFAULT_SEGMENT,
          archived: true,
        }).isActive(),
      ).toBe(false);
    });
  });
});
