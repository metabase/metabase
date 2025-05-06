import { useEffect, useState } from "react";

import type { IconName } from "metabase/ui";

export function getIconForType(
  type: "database" | "schema" | "table",
): IconName {
  if (type === "table") {
    return "table2";
  }
  return type;
}

export function hasChildren(type: "database" | "schema" | "table"): boolean {
  return type !== "table";
}

export function useExpandedState<T extends string | number>(
  initialId: T | undefined,
) {
  const initialState = initialId !== undefined ? { [initialId]: true } : {};
  const [expanded, setExpanded] = useState(initialState);

  useEffect(() => {
    if (initialId !== undefined) {
      setExpanded((state) => ({
        ...state,
        [initialId]: true,
      }));
    }
  }, [initialId]);

  const toggle = (id: T) => {
    setExpanded((state) => ({
      ...state,
      [id]: !state[id],
    }));
  };

  return {
    expanded,
    toggle,
  };
}
