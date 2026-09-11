import { useMemo } from "react";

import { useListPermissionsGroupsQuery } from "metabase/api";
import type { GroupListQuery } from "metabase-types/api";

import { type GroupLookup, createGroupLookup } from "./utils";

const EMPTY_GROUPS: GroupListQuery[] = [];

export function useGroupLookup(): GroupLookup {
  const { data: groups = EMPTY_GROUPS } = useListPermissionsGroupsQuery({});
  return useMemo(() => createGroupLookup(groups), [groups]);
}
