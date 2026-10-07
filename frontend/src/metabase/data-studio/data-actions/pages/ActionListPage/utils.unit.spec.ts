import { type ActionTreeNode, getDefaultExpanded } from "./utils";

const TREE: ActionTreeNode[] = [
  {
    id: "collection-1",
    name: "Billing",
    nodeType: "folder",
    icon: "folder",
    children: [
      {
        id: "collection-2",
        name: "Invoices",
        nodeType: "folder",
        icon: "folder",
        children: [],
      },
    ],
  },
  {
    id: "collection-3",
    name: "Support",
    nodeType: "folder",
    icon: "folder",
    children: [],
  },
];

describe("getDefaultExpanded", () => {
  it("should expand every node without a collection", () => {
    expect(getDefaultExpanded(TREE, undefined)).toBe(true);
  });

  it("should expand the collection and its ancestors only", () => {
    expect(getDefaultExpanded(TREE, 2)).toEqual({
      "collection-1": true,
      "collection-2": true,
    });
  });

  it("should expand nothing for a collection that is not in the tree", () => {
    expect(getDefaultExpanded(TREE, 4)).toEqual({});
  });
});
