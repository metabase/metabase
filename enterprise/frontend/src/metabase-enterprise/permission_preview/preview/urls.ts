import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import type { DatabaseId } from "metabase-types/api";

import type { Principal, PrincipalType } from "../api";

export type PreviewTab =
  | "data"
  | "collections"
  | "tenant-collections"
  | "tenant-specific-collections"
  | "application";

export type PreviewRouteParams = {
  principalType?: string;
  principalId?: string;
  databaseId?: string;
  schemaName?: string;
};

export function isPrincipalType(value: unknown): value is PrincipalType {
  return value === "user" || value === "group" || value === "tenant";
}

export function parsePrincipalType(params: PreviewRouteParams): PrincipalType {
  return isPrincipalType(params.principalType) ? params.principalType : "user";
}

export function parsePrincipal(params: PreviewRouteParams): Principal | null {
  const id = Number(params.principalId);
  if (!isPrincipalType(params.principalType) || !Number.isInteger(id)) {
    return null;
  }
  return { type: params.principalType, id };
}

export function getPreviewUrl(
  tab: PreviewTab,
  principal?: Principal | { type: PrincipalType },
): string {
  const base = `${getPermissionsBasePath()}/${tab}/preview`;
  if (principal == null) {
    return base;
  }
  return "id" in principal
    ? `${base}/${principal.type}/${principal.id}`
    : `${base}/${principal.type}`;
}

export function getDataPreviewUrl(
  principal: Principal,
  databaseId?: DatabaseId,
  schemaName?: string,
): string {
  const principalUrl = getPreviewUrl("data", principal);
  if (databaseId == null) {
    return principalUrl;
  }
  const databaseUrl = `${principalUrl}/database/${databaseId}`;
  return schemaName == null
    ? databaseUrl
    : `${databaseUrl}/schema/${encodeURIComponent(schemaName)}`;
}

/**
 * The principal last previewed on any tab, so switching tabs and picking Preview again keeps who is being previewed.
 */
let lastPrincipal: Principal | null = null;

export function getLastPrincipal(): Principal | null {
  return lastPrincipal;
}

export function setLastPrincipal(principal: Principal | null) {
  lastPrincipal = principal;
}
