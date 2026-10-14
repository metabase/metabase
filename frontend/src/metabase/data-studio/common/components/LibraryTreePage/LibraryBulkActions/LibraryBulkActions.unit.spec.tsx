import { createMockCollectionItem } from "metabase-types/api/mocks";

import { isMoveDestinationDisabled } from "./LibraryBulkActions";

describe("isMoveDestinationDisabled", () => {
  const moving = ["5"]; // collection 5 is being moved

  it("disables the collection being moved (can't move into itself)", () => {
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({
          id: 5,
          model: "collection",
          location: "/1/",
        }),
        moving,
      ),
    ).toBe(true);
  });

  it("disables a descendant of a collection being moved", () => {
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({
          id: 7,
          model: "collection",
          location: "/1/5/",
        }),
        moving,
      ),
    ).toBe(true);
  });

  it("allows unrelated collections", () => {
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({
          id: 8,
          model: "collection",
          location: "/1/",
        }),
        moving,
      ),
    ).toBe(false);
  });

  it("never disables non-collection items or when nothing is a collection", () => {
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({ id: 9, model: "table", location: "/1/5/" }),
        moving,
      ),
    ).toBe(false);
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({ id: 5, model: "collection" }),
        [],
      ),
    ).toBe(false);
  });
});
