import { TreeList } from "@ui/tree/Tree/index";
import React, { useMemo, useState } from "react";
import Collections from "metabase/entities/collections";

const TreePreviewComponent = props => {
  const [selected, setSelected] = useState(null);

  const trees = useMemo(() => {
    const data = props.list ?? [];

    // Create a map for quick lookup and add an empty children array to each node
    const map = new Map();
    data.forEach(node => {
      node.children = [];
      map.set(node.id, node);
    });

    // Build the tree
    data.forEach(node => {
      const parentIds = node.location
        ? node.location.split("/").filter(id => id)
        : [];
      if (parentIds.length) {
        const parentId = parentIds[parentIds.length - 1]; // the last one is the direct parent
        const parentNode = map.get(parseInt(parentId));
        if (parentNode) {
          parentNode.children.push(node);
        }
      }
    });

    // Get the top level nodes (nodes without a parent)
    return data.filter(node => {
      const parentIds = node.location
        ? node.location.split("/").filter(id => id)
        : [];
      return !parentIds.length;
    });
  }, [props.list]);

  return (
    <TreeList
      form={trees}
      selected={selected}
      setSelected={setSelected}
    ></TreeList>
  );
};

export const TreePreview = Collections.loadList({
  loadingAndErrorWrapper: false,
})(TreePreviewComponent);
