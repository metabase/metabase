import { createMockMetadata } from "__support__/metadata";
import type { Segment } from "metabase-types/api";
import { createMockSegment } from "metabase-types/api/mocks";

interface SetupOpts {
  segment?: Segment;
}

const setup = ({ segment = createMockSegment() }: SetupOpts = {}) => {
  const metadata = createMockMetadata({
    segments: [segment],
  });

  const instance = metadata.segment(segment.id);
  if (!instance) {
    throw new TypeError();
  }

  return instance;
};

describe("Segment", () => {
  describe("instantiation", () => {
    it("should create an instance of Segment", () => {
      const segment = setup();
      expect(segment).toBeDefined();
    });
  });

  describe("displayName", () => {
    it("should return the `name` property found on the instance", () => {
      const segment = setup({
        segment: createMockSegment({
          name: "foo",
        }),
      });

      expect(segment.displayName()).toBe("foo");
    });
  });

  describe("filterClause", () => {
    it("should return a filter clause", () => {
      const segment = setup({
        segment: createMockSegment({
          id: 123,
        }),
      });

      expect(segment.filterClause()).toEqual(["segment", 123]);
    });
  });

  describe("isActive", () => {
    it("should return true if the segment is not archived", () => {
      const segment = setup({
        segment: createMockSegment({
          archived: false,
        }),
      });

      expect(segment.isActive()).toBe(true);
    });

    it("should return false if the segment is archived", () => {
      const segment = setup({
        segment: createMockSegment({
          archived: true,
        }),
      });

      expect(segment.isActive()).toBe(false);
    });
  });
});
