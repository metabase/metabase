import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { Database, Transform } from "metabase-types/api";

import { nameSorter } from "../utils";

export function buildTreeData(
  transforms: Transform[],
  databases: Database[],
): ITreeNodeItem[] {
  type Tier<T> = (t: T) => ITreeNodeItem;
  const tiers: Tier<Transform>[] = [
    ({ target }) => ({
      id: `database-${target.database}`,
      name:
        databases.find((d) => d.id === target.database)?.name ||
        t`Unknown database`,
      icon: "database",
    }),
    ({ target }) => ({
      id: `schema-${target.database}-${target.schema}`,
      name: target.schema || t`Unknown schema`,
      icon: "folder",
    }),
  ];

  const nodes: Record<string | number, ITreeNodeItem> = {};
  const root: ITreeNodeItem = {
    id: "root",
    name: "root",
    icon: "empty",
    children: [],
  };

  transforms.forEach((transform) => {
    let prev = root;
    tiers.forEach((tier) => {
      let node = tier(transform);
      const existingNode = nodes[node.id];
      if (!existingNode) {
        node = { ...node, children: [] };
        nodes[node.id] = node;
        prev.children?.push(node);
      } else {
        node = existingNode;
      }
      prev = node;
    });
    prev.children?.push({
      id: transform.id,
      name: transform.target.name,
      icon: "table2",
      data: transform,
    });
  });

  const recursiveAlpha = (node: ITreeNodeItem) => {
    node.children?.sort(nameSorter);
    node.children?.forEach(recursiveAlpha);
    return node;
  };

  return recursiveAlpha(root).children || [];
}
