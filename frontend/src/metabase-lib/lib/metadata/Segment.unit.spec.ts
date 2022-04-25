import Segment from "./Segment";
import { createMockSegmentInstance } from "metabase-lib/lib/mocks";

describe("Segment", () => {
  const segmentInstance = createMockSegmentInstance({
    name: "foo",
    id: 123,
  });

  describe("instantiation", () => {
    it("should create an instance of Segment", () => {
      expect(segmentInstance).toBeInstanceOf(Segment);
    });

    it("should add `object` props to the instance (because it extends Base)", () => {
      expect(
        createMockSegmentInstance({
          // @ts-expect-error -- we are testing that all properties get added to the instance
          foo: "bar",
        }),
      ).toHaveProperty("foo", "bar");
    });
  });

  describe("displayName", () => {
    it("should return the `name` property found on the instance", () => {
      expect(segmentInstance.displayName()).toBe("foo");
    });
  });

  describe("filterClause", () => {
    it("should return a filter clause", () => {
      expect(segmentInstance.filterClause()).toEqual(["segment", 123]);
    });
  });

  describe("isActive", () => {
    it("should return true if the segment is not archived", () => {
      expect(
        createMockSegmentInstance({
          archived: true,
        }).isActive(),
      ).toBe(false);
    });

    it("should return false if the segment is archived", () => {
      expect(
        createMockSegmentInstance({
          archived: false,
        }).isActive(),
      ).toBe(true);
    });
  });
});
