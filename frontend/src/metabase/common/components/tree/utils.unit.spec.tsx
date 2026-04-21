import type { ITreeNodeItem } from "./types";
import {
  getAllDescendantIds,
  getAllExpandableIds,
  getInitialExpandedIds,
} from "./utils";

const createTreeNode = (
  id: number | string,
  children: ITreeNodeItem[] = [],
): ITreeNodeItem => ({
  id,
  name: `Node ${id}`,
  icon: "folder",
  children,
});

describe("tree/utils", () => {
  describe("getAllDescendantIds", () => {
    it("returns empty set for empty tree", () => {
      const result = getAllDescendantIds([]);
      expect(result.size).toBe(0);
    });

    it("returns single id for single node without children", () => {
      const tree = [createTreeNode(1)];
      const result = getAllDescendantIds(tree);
      expect(result.size).toBe(1);
      expect(result.has(1)).toBe(true);
    });

    it("returns all ids for flat tree", () => {
      const tree = [createTreeNode(1), createTreeNode(2), createTreeNode(3)];
      const result = getAllDescendantIds(tree);
      expect(result.size).toBe(3);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(3)).toBe(true);
    });

    it("returns all ids including nested children", () => {
      const tree = [
        createTreeNode(1, [
          createTreeNode(2, [createTreeNode(3)]),
          createTreeNode(4),
        ]),
        createTreeNode(5),
      ];
      const result = getAllDescendantIds(tree);
      expect(result.size).toBe(5);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(3)).toBe(true);
      expect(result.has(4)).toBe(true);
      expect(result.has(5)).toBe(true);
    });

    it("handles deeply nested trees", () => {
      const tree = [
        createTreeNode(1, [
          createTreeNode(2, [
            createTreeNode(3, [createTreeNode(4, [createTreeNode(5)])]),
          ]),
        ]),
      ];
      const result = getAllDescendantIds(tree);
      expect(result.size).toBe(5);
      [1, 2, 3, 4, 5].forEach((id) => {
        expect(result.has(id)).toBe(true);
      });
    });

    it("handles string ids", () => {
      const tree = [
        createTreeNode("a", [createTreeNode("b")]),
        createTreeNode("c"),
      ];
      const result = getAllDescendantIds(tree);
      expect(result.size).toBe(3);
      expect(result.has("a")).toBe(true);
      expect(result.has("b")).toBe(true);
      expect(result.has("c")).toBe(true);
    });

    it("returns a Set for O(1) lookup", () => {
      const tree = [createTreeNode(1)];
      const result = getAllDescendantIds(tree);
      expect(result instanceof Set).toBe(true);
    });
  });

  describe("getAllExpandableIds", () => {
    it("returns empty array for empty tree", () => {
      const result = getAllExpandableIds([]);
      expect(result).toEqual([]);
    });

    it("returns empty array for nodes without children", () => {
      const tree = [createTreeNode(1), createTreeNode(2)];
      const result = getAllExpandableIds(tree);
      expect(result).toEqual([]);
    });

    it("returns ids of nodes with children", () => {
      const tree = [createTreeNode(1, [createTreeNode(2)]), createTreeNode(3)];
      const result = getAllExpandableIds(tree);
      expect(result).toEqual([1]);
    });

    it("returns all expandable ids in nested tree", () => {
      const tree = [
        createTreeNode(1, [
          createTreeNode(2, [createTreeNode(3)]),
          createTreeNode(4),
        ]),
      ];
      const result = getAllExpandableIds(tree);
      expect(result).toContain(1);
      expect(result).toContain(2);
      expect(result).not.toContain(3);
      expect(result).not.toContain(4);
    });
  });

  describe("getInitialExpandedIds", () => {
    it("returns empty array when selected id is not in tree", () => {
      const tree = [createTreeNode(1), createTreeNode(2)];
      const result = getInitialExpandedIds(999, tree);
      expect(result).toEqual([]);
    });

    it("returns single id when selected id is at root level", () => {
      const tree = [createTreeNode(1), createTreeNode(2)];
      const result = getInitialExpandedIds(1, tree);
      expect(result).toEqual([1]);
    });

    it("returns path to nested selected id", () => {
      const tree = [
        createTreeNode(1, [createTreeNode(2, [createTreeNode(3)])]),
      ];
      const result = getInitialExpandedIds(3, tree);
      expect(result).toEqual([1, 2, 3]);
    });
  });
});
