import {
  createMockCollection,
  createMockRemoteSyncEntity,
} from "metabase-types/api/mocks";

import { groupEntitiesByCollection } from "./displayGroups";

const LIBRARY_COLLECTION_ID = 1;
const LIBRARY_COLLECTION = createMockCollection({
  id: LIBRARY_COLLECTION_ID,
  name: "Library",
});

function groupActions(cardId: number | null) {
  return groupEntitiesByCollection({
    entities: [
      createMockRemoteSyncEntity({
        id: 10,
        model: "action",
        collection_id: undefined,
        card_id: cardId,
      }),
    ],
    transformsRootEntity: undefined,
    namespaceCollectionMap: new Map(),
    collectionMap: new Map([[LIBRARY_COLLECTION_ID, LIBRARY_COLLECTION]]),
    libraryCollectionId: LIBRARY_COLLECTION_ID,
    getCollectionPathSegments: () => [],
  });
}

describe("groupEntitiesByCollection", () => {
  it("should group a data action at the data actions root under the Library", () => {
    const [group] = groupActions(null);

    expect(group.spec.id).toBe("data-actions");
    expect(group.collectionId).toBe(1);
  });

  it("should not group a model action under the Library", () => {
    const [group] = groupActions(5);

    expect(group.spec.id).toBe("default");
  });
});
