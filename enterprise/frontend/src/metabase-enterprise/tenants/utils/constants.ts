import type { CollectionNamespace } from "metabase-types/api";

export const SHARED_TENANT_NAMESPACE: CollectionNamespace =
  "shared-tenant-collection";
export const TENANT_SPECIFIC_NAMESPACE: CollectionNamespace = "tenant-specific";

export const TENANT_NAMESPACES: CollectionNamespace[] = [
  SHARED_TENANT_NAMESPACE,
  TENANT_SPECIFIC_NAMESPACE,
];
