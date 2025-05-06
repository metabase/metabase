import { useEffect, useState } from "react";
import { useMount } from "react-use";

import { useDatabasePrefetch } from "metabase/api";
import type { IconName } from "metabase/ui";
import type { DatabaseId, SchemaId } from "metabase-types/api";

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

export function usePrefetch({
  databaseId,
  schemaId,
}: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const prefetchDatabaseSchemas = useDatabasePrefetch("listDatabaseSchemas");
  const prefetchDatabaseSchemaTables = useDatabasePrefetch(
    "listDatabaseSchemaTables",
  );

  useMount(() => {
    if (databaseId !== undefined) {
      prefetchDatabaseSchemas({ id: databaseId });
      if (schemaId !== undefined) {
        prefetchDatabaseSchemaTables({ id: databaseId, schema: schemaId });
      }
    }
  });
}
