import { t } from "ttag";

import type { CollectionPermissionsConfig } from "./types";

export const getDefaultCollectionPermissionsConfig =
  (): CollectionPermissionsConfig => ({
    tab: "collections",
    navigationBasePath: "/admin/permissions/collections",
    sidebarTitle: t`Collections`,
    rootCollectionName: undefined,
    collectionsQuery: {
      tree: true,
      "exclude-other-user-collections": true,
      "exclude-archived": true,
    },
    filterTenantGroupsFromNonTenantCollections: true,
    handleInstanceAnalytics: true,
  });
