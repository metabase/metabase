import {
  createMockCollection,
  createMockRemoteSyncActionData,
  createMockRemoteSyncCardData,
  createMockRemoteSyncCollectionData,
  createMockRemoteSyncDirtyItem,
} from "metabase-types/api/mocks";

import { getRemoteSyncChanges, hasRemoteSyncChanges } from "./utils";

const LIBRARY = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
});
const PARENT = createMockCollection({ id: 3, name: "Parent" });

describe("getRemoteSyncChanges", () => {
  it("marks every collection a changed entity is in", () => {
    const changes = getRemoteSyncChanges([
      createMockRemoteSyncDirtyItem({
        model: "card",
        data: createMockRemoteSyncCardData({
          collection_id: 4,
          collection: createMockCollection({
            id: 4,
            effective_ancestors: [PARENT],
          }),
        }),
      }),
    ]);

    expect(hasRemoteSyncChanges(changes, { type: "collection", id: 4 })).toBe(
      true,
    );
    expect(hasRemoteSyncChanges(changes, { type: "collection", id: 3 })).toBe(
      true,
    );
    expect(hasRemoteSyncChanges(changes, { type: "collection", id: 1 })).toBe(
      false,
    );
  });

  it("marks changed collection itself", () => {
    const changes = getRemoteSyncChanges([
      createMockRemoteSyncDirtyItem({
        id: 3,
        model: "collection",
        data: createMockRemoteSyncCollectionData({ id: 3 }),
      }),
    ]);

    expect(hasRemoteSyncChanges(changes, { type: "collection", id: 3 })).toBe(
      true,
    );
    expect(hasRemoteSyncChanges(changes, { type: "collection", id: 4 })).toBe(
      false,
    );
  });

  it.each([
    {
      entity: createMockRemoteSyncDirtyItem({
        model: "card",
        data: createMockRemoteSyncCardData({
          collection_id: 2,
          collection: createMockCollection({
            id: 2,
            effective_ancestors: [LIBRARY],
          }),
        }),
      }),
      areas: ["library"],
    },
    {
      entity: createMockRemoteSyncDirtyItem({
        id: 1,
        model: "collection",
        data: createMockRemoteSyncCollectionData({
          id: 1,
          type: "library",
        }),
      }),
      areas: ["library"],
    },
    {
      entity: createMockRemoteSyncDirtyItem({ model: "tableusersettings" }),
      areas: ["library"],
    },
    {
      entity: createMockRemoteSyncDirtyItem({ model: "transformtag" }),
      areas: ["transforms"],
    },
    {
      entity: createMockRemoteSyncDirtyItem({ model: "pythonlibrary" }),
      areas: ["transforms", "python-library"],
    },
    {
      entity: createMockRemoteSyncDirtyItem({ model: "nativequerysnippet" }),
      areas: ["snippets"],
    },
    {
      entity: createMockRemoteSyncDirtyItem({ model: "action" }),
      areas: ["data-actions"],
    },
    {
      entity: createMockRemoteSyncDirtyItem({ model: "glossary" }),
      areas: ["glossary"],
    },
  ])("puts changed $entity.model in $areas areas", ({ entity, areas }) => {
    const changes = getRemoteSyncChanges([entity]);

    expect(changes.areas).toEqual(new Set(areas));
  });

  it("keeps model actions out of data actions area", () => {
    const changes = getRemoteSyncChanges([
      createMockRemoteSyncDirtyItem({
        model: "action",
        data: createMockRemoteSyncActionData({ model_id: 10 }),
      }),
    ]);

    expect(changes.areas.has("data-actions")).toBe(false);
  });

  it("marks changed transforms", () => {
    const changes = getRemoteSyncChanges([
      createMockRemoteSyncDirtyItem({ id: 7, model: "transform" }),
    ]);

    expect(hasRemoteSyncChanges(changes, { type: "transform", id: 7 })).toBe(
      true,
    );
    expect(hasRemoteSyncChanges(changes, { type: "transform", id: 8 })).toBe(
      false,
    );
  });
});
