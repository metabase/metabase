import { useMemo } from "react";

export const useTreeFilter = <
  T extends Record<string, any> & { children?: T[] },
  K extends keyof T,
>({
  data,
  searchQuery,
  searchProps,
}: {
  data: T[];
  searchQuery: string | undefined;
  searchProps: K[];
}): T[] => {
  return useMemo(() => {
    const filterLevel = (nodes: T[]): T[] => {
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
              if (
                typeof node[s] === "string" &&
                typeof searchQuery === "string"
              ) {
                return node[s]
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase());
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
  }, [data, searchQuery, searchProps]);
};
