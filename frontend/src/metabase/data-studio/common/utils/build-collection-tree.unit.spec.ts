import type { Collection, NativeQuerySnippet } from "metabase-types/api";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
} from "metabase-types/api/mocks";

import type { TreeItem } from "../types";

import {
  buildCollectionTreeChildren,
  buildCollectionTreeNode,
} from "./build-collection-tree";

const createLeafNode = (snippet: NativeQuerySnippet): TreeItem => ({
  id: `snippet:${snippet.id}`,
  name: snippet.name,
  icon: "snippet",
  model: "snippet",
  data: { ...snippet, model: "snippet" },
});

const ids = (items: TreeItem[] = []): string[] => items.map((item) => item.id);

const TOP_FOLDER = createMockCollection({ id: 1, parent_id: null });
const NESTED_FOLDER = createMockCollection({ id: 2, parent_id: 1 });
const EMPTY_FOLDER = createMockCollection({ id: 3, parent_id: null });
const COLLECTIONS: Collection[] = [TOP_FOLDER, NESTED_FOLDER, EMPTY_FOLDER];

const TOP_SNIPPET = createMockNativeQuerySnippet({
  id: 10,
  collection_id: null,
});
const FOLDER_SNIPPET = createMockNativeQuerySnippet({
  id: 11,
  collection_id: 1,
});
const NESTED_SNIPPET = createMockNativeQuerySnippet({
  id: 12,
  collection_id: 2,
});
const SNIPPETS = [TOP_SNIPPET, FOLDER_SNIPPET, NESTED_SNIPPET];

describe("buildCollectionTreeChildren", () => {
  it("lists the folders before the leaves under a parent, with each folder's subtree", () => {
    const tree = buildCollectionTreeChildren(
      null,
      COLLECTIONS,
      SNIPPETS,
      createLeafNode,
    );

    expect(ids(tree)).toEqual(["collection:1", "collection:3", "snippet:10"]);
    expect(ids(tree[0].children)).toEqual(["collection:2", "snippet:11"]);
    expect(ids(tree[0].children?.[0].children)).toEqual(["snippet:12"]);
  });

  it("returns nothing for a parent with no folders or leaves", () => {
    expect(
      buildCollectionTreeChildren(3, COLLECTIONS, SNIPPETS, createLeafNode),
    ).toEqual([]);
  });
});

describe("buildCollectionTreeNode", () => {
  it("builds a folder row with the folders and leaves under it", () => {
    const node = buildCollectionTreeNode(
      NESTED_FOLDER,
      COLLECTIONS,
      SNIPPETS,
      createLeafNode,
    );

    expect(node).toEqual({
      id: "collection:2",
      name: NESTED_FOLDER.name,
      model: "collection",
      icon: "folder",
      data: { ...NESTED_FOLDER, model: "collection" },
      children: [createLeafNode(NESTED_SNIPPET)],
    });
  });

  it("leaves children undefined for an empty folder", () => {
    const node = buildCollectionTreeNode(
      EMPTY_FOLDER,
      COLLECTIONS,
      SNIPPETS,
      createLeafNode,
    );

    expect(node.children).toBeUndefined();
  });
});
