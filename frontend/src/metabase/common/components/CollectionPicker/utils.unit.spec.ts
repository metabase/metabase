import { getCollectionIdPath } from "./utils";

describe("CollectionPicker > utils", () => {
  describe("getCollectionIdPath", () => {
    it("should handle the current user's personal collection", () => {
      const path = getCollectionIdPath(
        {
          id: 1337,
          location: "/",
          effective_location: "/",
          is_personal: true,
        },
        1337,
        false,
      );

      expect(path).toEqual([1337]);
    });

    it("should handle subcollections of the current user's personal collection", () => {
      const path = getCollectionIdPath(
        {
          id: 1339,
          location: "/1337/",
          effective_location: "/1337/",
          is_personal: true,
        },
        1337,
        false,
      );

      expect(path).toEqual([1337, 1339]);
    });

    it("should handle all users' personal collections", () => {
      const path = getCollectionIdPath(
        {
          id: "personal",
          location: "/",
          effective_location: "/",
        },
        1337,
        false,
      );

      expect(path).toEqual(["personal"]);
    });

    it("should handle subcollections of all users' personal collections", () => {
      const path = getCollectionIdPath(
        {
          id: 8675309,
          location: "/1400/",
          effective_location: "/1400/",
        },
        1337,
        true,
      );

      expect(path).toEqual(["personal", 1400, 8675309]);
    });

    it("should handle the current user's personal collection within all users' personal collections", () => {
      const path = getCollectionIdPath(
        {
          id: 1337,
          location: "/",
          effective_location: "/",
          is_personal: true,
        },
        1337,
        true,
      );

      expect(path).toEqual(["personal", 1337]);
    });

    it("should handle subcollections of the current user's personal collection within all users' personal collections 🥴", () => {
      const path = getCollectionIdPath(
        {
          id: 1339,
          location: "/1337/",
          effective_location: "/1337/",
          is_personal: true,
        },
        1337,
        true,
      );

      expect(path).toEqual(["personal", 1337, 1339]);
    });

    it("should handle root collection", () => {
      const path = getCollectionIdPath(
        {
          id: "root",
          location: "/",
          effective_location: "/",
        },
        1337,
        false,
      );

      expect(path).toEqual(["root"]);
    });

    it("should handle subcollections of the root collection", () => {
      const path = getCollectionIdPath(
        {
          id: 9,
          location: "/6/7/8/",
          effective_location: "/6/7/8/",
        },
        1337,
        false,
      );

      expect(path).toEqual(["root", 6, 7, 8, 9]);
    });

    it("should use effective location", () => {
      const path = getCollectionIdPath(
        {
          id: 9,
          location: "/4/5/6/7/8/",
          effective_location: "/6/7/8/",
        },
        1337,
        false,
      );

      expect(path).toEqual(["root", 6, 7, 8, 9]);
    });
  });
});
