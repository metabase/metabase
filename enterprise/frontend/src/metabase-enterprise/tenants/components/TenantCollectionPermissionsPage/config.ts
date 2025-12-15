import { t } from "ttag";

import type { CollectionPermissionsConfig } from "metabase/admin/permissions/pages/CollectionPermissionsPage/types";

export const getTenantCollectionPermissionsConfig =
  (): CollectionPermissionsConfig => ({
    tab: "tenant-collections",
    navigationBasePath: "/admin/permissions/tenant-collections",
    sidebarTitle: t`Tenant Collections`,
    rootCollectionName: t`Root shared collection`,
    collectionsQuery: {
      tree: true,
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      namespace: "shared-tenant-collection",
    },
    filterTenantGroupsFromNonTenantCollections: false,
    handleInstanceAnalytics: false,
  });
