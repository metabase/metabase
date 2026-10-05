import { useMemo } from "react";

import { useListPermissionsGroupsQuery } from "metabase/api";
import type { GroupListQuery } from "metabase-types/api";

import { type GroupLookup, createGroupLookup } from "./utils";

const EMPTY_GROUPS: GroupListQuery[] = [];

type UseGroupLookupOptions = {
  // "internal" leaves tenant groups out, for providers whose users are never tenants
  tenancy?: "internal" | "external";
};

export function useGroupLookup({
  tenancy,
}: UseGroupLookupOptions = {}): GroupLookup {
  const { data: groups = EMPTY_GROUPS } = useListPermissionsGroupsQuery(
    tenancy == null ? {} : { tenancy },
  );
  return useMemo(() => createGroupLookup(groups), [groups]);
}
