import type { CollectionEssentials, CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionEssential,
} from "metabase-types/api/mocks";

import { getCollectionList } from "./utils";

const COLLECTION_ID = 1;

const createCollectionEssentialsList = (
  idList: CollectionId[],
): CollectionEssentials[] => {
  return idList.map(id => createMockCollectionEssential({ id }));
};

const setup = ({
  ancestors = [],
  baseCollectionId = null,
}: {
  ancestors: CollectionId[];
  baseCollectionId?: CollectionId | null;
}) => {
  const collection = createMockCollection({
    id: COLLECTION_ID,
    effective_ancestors: createCollectionEssentialsList(ancestors),
  });

  return getCollectionList({
    collection,
    baseCollectionId,
  });
};

describe("getCollectionList", () => {
  it("should return an empty array if baseCollectionId matches collection id", () => {
    const result = setup({
      ancestors: [],
      baseCollectionId: COLLECTION_ID,
    });
    expect(result).toEqual([]);
  });

  it("should return all ancestors if baseCollectionId is not provided", () => {
    const result = setup({
      ancestors: [2, 3],
    });
    expect(result).toEqual([
      { id: 2, name: "Collection 2" },
      { id: 3, name: "Collection 3" },
    ]);
  });

  it("should return ancestors excluding root if baseCollectionId is not provided and the first ancestor is root", () => {
    const result = setup({ ancestors: ["root", 3, 4] });
    expect(result).toEqual([
      { id: 3, name: "Collection 3" },
      { id: 4, name: "Collection 4" },
    ]);
  });

  it("should return ancestors from baseCollectionId onward", () => {
    const result = setup({ ancestors: [2, 3, 4], baseCollectionId: 3 });
    expect(result).toEqual([
      { id: 3, name: "Collection 3" },
      { id: 4, name: "Collection 4" },
    ]);
  });

  it("should return all ancestors if baseCollectionId is not found in ancestors", () => {
    const result = setup({ ancestors: [2, 3, 4], baseCollectionId: 5 });
    expect(result).toEqual([
      { id: 2, name: "Collection 2" },
      { id: 3, name: "Collection 3" },
      { id: 4, name: "Collection 4" },
    ]);
  });
});
