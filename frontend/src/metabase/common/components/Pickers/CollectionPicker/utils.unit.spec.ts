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
  });
});
