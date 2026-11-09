import {
  createMockRemoteSyncEntity,
  createMockRemoteSyncEntityParent,
  createMockRemoteSyncEntityCollection,
  createMockRemoteSyncEntityCollectionAncestor,
} from "metabase-types/api/mocks";

import { getRemoteSyncChanges, hasRemoteSyncChanges } from "./utils";

const LIBRARY = createMockRemoteSyncEntityCollectionAncestor({
  id: 1,
  name: "Library",
  type: "library",
});
const PARENT = createMockRemoteSyncEntityCollectionAncestor({
  id: 3,
  name: "Parent",
});

describe("getRemoteSyncChanges", () => {
  it("marks collection of changed entity and its ancestors", () => {
    const changes = getRemoteSyncChanges([
      createMockRemoteSyncEntity({
        model: "card",
        collection: createMockRemoteSyncEntityCollection({
          id: 4,
          effective_ancestors: [PARENT],
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
      createMockRemoteSyncEntity({
        model: "collection",
        id: 3,
        collection: createMockRemoteSyncEntityCollection({ id: 3 }),
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
      entity: createMockRemoteSyncEntity({
        model: "card",
        collection: createMockRemoteSyncEntityCollection({
          id: 2,
          effective_ancestors: [LIBRARY],
        }),
      }),
      areas: ["library"],
    },
    {
      entity: createMockRemoteSyncEntity({ model: "tableusersettings" }),
      areas: ["library"],
    },
    {
      entity: createMockRemoteSyncEntity({ model: "transformtag" }),
      areas: ["transforms"],
    },
    {
      entity: createMockRemoteSyncEntity({ model: "pythonlibrary" }),
      areas: ["transforms", "python-library"],
    },
    {
      entity: createMockRemoteSyncEntity({ model: "nativequerysnippet" }),
      areas: ["snippets"],
    },
    {
      entity: createMockRemoteSyncEntity({ model: "action" }),
      areas: ["data-actions"],
    },
    {
      entity: createMockRemoteSyncEntity({ model: "glossary" }),
      areas: ["glossary"],
    },
  ])("puts changed $entity.model in $areas areas", ({ entity, areas }) => {
    const changes = getRemoteSyncChanges([entity]);

    expect(changes.areas).toEqual(new Set(areas));
  });

  it("keeps model actions out of data actions area", () => {
    const changes = getRemoteSyncChanges([
      createMockRemoteSyncEntity({
        model: "action",
        parent: createMockRemoteSyncEntityParent({ model: "card", id: 10 }),
      }),
    ]);

    expect(changes.areas.has("data-actions")).toBe(false);
  });

  it("marks changed transforms", () => {
    const changes = getRemoteSyncChanges([
      createMockRemoteSyncEntity({ model: "transform", id: 7 }),
    ]);

    expect(hasRemoteSyncChanges(changes, { type: "transform", id: 7 })).toBe(
      true,
    );
    expect(hasRemoteSyncChanges(changes, { type: "transform", id: 8 })).toBe(
      false,
    );
  });
});
