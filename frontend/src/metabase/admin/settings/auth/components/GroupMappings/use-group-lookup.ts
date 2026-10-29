import { useMemo } from "react";

import { useListPermissionsGroupsQuery } from "metabase/api";

import { type GroupLookup, createGroupLookup } from "./utils";

type UseGroupLookupOptions = {
  // "internal" leaves tenant groups out, for providers whose users are never tenants
  tenancy?: "internal" | "external";
};

export function useGroupLookup({
  tenancy,
}: UseGroupLookupOptions = {}): GroupLookup {
  const { data: groups, isError } = useListPermissionsGroupsQuery(
    tenancy == null ? {} : { tenancy },
  );
  return useMemo(() => createGroupLookup(groups, isError), [groups, isError]);
}
