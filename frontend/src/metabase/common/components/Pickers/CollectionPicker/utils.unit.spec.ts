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
        namespace: "shared-tenant-collection",
        type: null,
        desc: "shared",
      },
      {
        location: null,
        namespace: "shared-tenant-collection",
        type: null,
        desc: "shared",
      },
      {
        location: "/",
        namespace: null,
        type: "tenant-specific-root-collection",
        desc: "dedicated",
      },
      {
        location: null,
        namespace: null,
        type: "tenant-specific-root-collection",
        desc: "dedicated",
      },
    ])(
      "should return 'tenant' for top-level $desc collection at $location",
      ({ location, namespace, type }) => {
        expect(getParentCollectionId(location, namespace, type)).toEqual(
          "tenant",
        );
      },
    );
  });
});
