import type { OmniPickerCollectionItem } from "../EntityPicker";

import { isSameDestination } from "./MoveModal";

const makeItem = (
  overrides: Partial<OmniPickerCollectionItem> = {},
): OmniPickerCollectionItem =>
  ({
    id: 1,
    name: "Test Item",
    model: "card" as const,
    ...overrides,
  }) as OmniPickerCollectionItem;

describe("isSameDestination", () => {
  it("should return true when moving to same dashboard", () => {
    const movingItem = makeItem({
      dashboard_id: 10,
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({ model: "dashboard" as any, id: 10 });
    expect(isSameDestination(movingItem, movingTarget)).toBe(true);
  });

  it("should return true when moving a regular item to its own collection", () => {
    const movingItem = makeItem({
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({
      model: "collection" as any,
      id: 7,
    });
    expect(isSameDestination(movingItem, movingTarget)).toBe(true);
  });

  it("should return false when moving to a different collection", () => {
    const movingItem = makeItem({
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({
      model: "collection" as any,
      id: 99,
    });
    expect(isSameDestination(movingItem, movingTarget)).toBe(false);
  });

  it("should allow moving a dashboard question to the collection where the dashboard lives", () => {
    const movingItem = makeItem({
      dashboard_id: 10,
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({
      model: "collection" as any,
      id: 7,
    });
    expect(isSameDestination(movingItem, movingTarget)).toBe(false);
  });

  it("should return false when moving to a different dashboard", () => {
    const movingItem = makeItem({
      dashboard_id: 10,
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({ model: "dashboard" as any, id: 20 });
    expect(isSameDestination(movingItem, movingTarget)).toBe(false);
  });
});
