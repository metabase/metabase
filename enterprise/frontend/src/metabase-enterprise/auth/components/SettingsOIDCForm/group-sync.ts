import { EMPTY_MAPPINGS } from "metabase/admin/settings/auth/components/GroupMappings";
import type { CustomOidcConfig } from "metabase-enterprise/api";

export const DEFAULT_GROUP_ATTRIBUTE = "groups";

export type OidcGroupSync = NonNullable<CustomOidcConfig["group-sync"]>;

/** Completes a provider's group sync map, since the API replaces the whole map on every write */
export function toGroupSync(
  current: Partial<OidcGroupSync> | undefined,
  changes: Partial<OidcGroupSync>,
): OidcGroupSync {
  return {
    enabled: current?.enabled ?? false,
    "group-attribute": current?.["group-attribute"] ?? DEFAULT_GROUP_ATTRIBUTE,
    "group-mappings": current?.["group-mappings"] ?? EMPTY_MAPPINGS,
    ...changes,
  };
}
