import type { CollectionItemModel } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import type { TreeItem } from "../types";

import { createEmptyStateItem } from "./create-empty-space-item";
import { getTreeRowHref } from "./get-tree-row-href";

const createLeafItem = (model: CollectionItemModel, id: number): TreeItem => ({
  id: `${model}:${id}`,
  name: "Sales",
  icon: "folder",
  model,
  data: createMockCollectionItem({ id, model, name: "Sales" }),
});

describe("getTreeRowHref", () => {
  it.each<[CollectionItemModel, string]>([
    ["table", "/data-studio/library/tables/7"],
    ["metric", "/data-studio/library/metrics/7"],
    ["snippet", "/data-studio/snippets/7"],
    ["action", "/data-studio/actions/7"],
    ["dashboard", "/dashboard/7-sales"],
  ])("links a %s row to %s", (model, expectedHref) => {
    expect(getTreeRowHref({ original: createLeafItem(model, 7) })).toBe(
      expectedHref,
    );
  });

  it("does not link collection rows", () => {
    const collection = createMockCollection({ id: 3 });
    const treeItem: TreeItem = {
      id: "collection:3",
      name: collection.name,
      icon: "folder",
      model: "collection",
      data: { ...collection, model: "collection" },
    };

    expect(getTreeRowHref({ original: treeItem })).toBeNull();
  });

  it("does not link empty state rows", () => {
    expect(
      getTreeRowHref({ original: createEmptyStateItem("snippets") }),
    ).toBeNull();
  });
});
