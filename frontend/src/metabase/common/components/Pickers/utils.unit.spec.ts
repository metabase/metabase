import { getCollectionIdPath } from "./utils";

describe("getCollectionIdPath", () => {
  it("should handle the current user's personal collection", () => {
    const path = getCollectionIdPath(
      {
        id: 1337,
        location: "/",
        effective_location: "/",
        is_personal: true,
        model: "collection",
      },
      1337,
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
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual([1337, 1339]);
  });

  it("should handle all users' personal collections", () => {
    const path = getCollectionIdPath(
      {
        id: "personal",
        location: "/",
        effective_location: "/",
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["personal"]);
  });

  it("should handle subcollections of all users' personal collections", () => {
    const path = getCollectionIdPath(
      {
        id: 8675309,
        location: "/1400/",
        effective_location: "/1400/",
        is_personal: true,
        model: "collection",
      },
      1337,
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
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual([1337]);
  });

  it("should handle subcollections of the current user's personal collection within all users' personal collections 🥴", () => {
    const path = getCollectionIdPath(
      {
        id: 1339,
        location: "/1337/",
        effective_location: "/1337/",
        is_personal: true,
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual([1337, 1339]);
  });

  it("should handle root collection", () => {
    const path = getCollectionIdPath(
      {
        id: "root",
        location: "/",
        effective_location: "/",
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["root"]);
  });

  it("should handle subcollections of the root collection", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/6/7/8/",
        effective_location: "/6/7/8/",
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["root", 6, 7, 8, 9]);
  });

  it("should use effective location", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/4/5/6/7/8/",
        effective_location: "/6/7/8/",
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["root", 6, 7, 8, 9]);
  });

  it("should use a negative id when the model is a dashboard", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/4/5/6/7/8/",
        effective_location: "/6/7/8/",
        model: "dashboard",
      },
      1337,
    );

    expect(path).toEqual(["root", 6, 7, 8, -9]);
  });
});
