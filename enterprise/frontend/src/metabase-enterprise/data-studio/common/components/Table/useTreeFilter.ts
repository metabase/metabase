type Item = Record<string, any> & { children?: Item[] };

export const useTreeFilter = ({
  data,
  searchQuery,
  searchProps,
}: {
  data: Item[];
  searchQuery: string | undefined;
  searchProps: string[];
}) => {
  const filterLevel = (nodes: Item[]): Item[] => {
    return nodes
      .map((node) => {
        if (node.children) {
          const filteredChildren = filterLevel(node.children);
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
          } else {
            return null;
          }
        }

        // Dealing with leaf nodes

        if (
          searchProps.some((s) => {
            if (typeof node[s] !== "string") {
              return false;
            }
            if (node[s].includes(searchQuery)) {
              return true;
            }
            return false;
          })
        ) {
          return node;
        }

        return null;
      })
      .filter((x) => !!x);
  };

  if (!searchQuery) {
    return data;
  }
  return filterLevel(data);
};
