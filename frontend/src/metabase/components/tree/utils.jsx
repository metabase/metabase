export const getInitialExpandedIds = (selectedId, nodes) =>
  nodes
    .map(node => {
      if (node.id === selectedId) {
        return [node.id];
      }

      if (node.children) {
        const path = getInitialExpandedIds(selectedId, node.children);
        return path.length > 0 ? [node.id, ...path] : [];
      }
    })
    .flat();
