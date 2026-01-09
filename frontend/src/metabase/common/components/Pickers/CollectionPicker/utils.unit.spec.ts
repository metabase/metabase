import { getParentCollectionId } from "./utils";

describe("CollectionPicker > utils", () => {
  describe("getParentCollectionId", () => {
    it("should get the root collection for null values", () => {
      expect(getParentCollectionId(null)).toEqual("root");
      expect(getParentCollectionId("")).toEqual("root");
      expect(getParentCollectionId(undefined)).toEqual("root");
    });

    it("should get the last item in a slash-separated list", () => {
      expect(getParentCollectionId("/1/2/3/4/5/")).toEqual(5);
      expect(getParentCollectionId("1/2/3/4/5")).toEqual(5);
      expect(getParentCollectionId("/100/200/300/400/500/")).toEqual(500);
    });

    it.each([
      {
        location: "/",
        namespace: "shared-tenant-collection" as const,
        type: null,
        desc: "shared tenant",
        expected: "tenant",
      },
      {
        location: null,
        namespace: "shared-tenant-collection" as const,
        type: null,
        desc: "shared tenant",
        expected: "tenant",
      },
      {
        location: "/",
        namespace: null,
        type: "tenant-specific-root-collection",
        desc: "dedicated tenant",
        expected: "tenant-specific",
      },
      {
        location: null,
        namespace: null,
        type: "tenant-specific-root-collection",
        desc: "dedicated tenant",
        expected: "tenant-specific",
      },
    ])(
      "should return $expected for top-level $desc collection at $location",
      ({ location, namespace, type, expected }) => {
        expect(getParentCollectionId(location, namespace, type)).toEqual(
          expected,
        );
      },
    );
  });
});
