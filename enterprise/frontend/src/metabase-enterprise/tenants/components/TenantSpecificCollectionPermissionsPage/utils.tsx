import { t } from "ttag";
import _ from "underscore";

import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { findCollectionById } from "metabase/common/utils/collections";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/common/utils/groups";
import {
  COLLECTION_OPTIONS,
  type CollectionSidebarType,
  Messages,
  type PermissionEditorType,
  getCollectionPermission,
  getCollectionWarning,
  getPermissionWarningModal,
  getRootCollectionTreeItem,
  getRootPermissionsCollection,
} from "metabase/permissions";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { isNotNull } from "metabase/utils/types";
import type {
  Collection,
  CollectionId,
  CollectionPermissions,
  DataPermissionValue,
  GroupInfo,
} from "metabase-types/api";
import { DataPermission, DataPermissionType } from "metabase-types/api";

export const tenantSpecificCollectionsQuery = {
  "exclude-other-user-collections": true,
  "exclude-archived": true,
  namespace: "tenant-specific",
} as const;

export const getTenantSpecificCollectionsSidebar = (
  selectedId: CollectionId | undefined,
): CollectionSidebarType => ({
  selectedId,
  title: t`Tenant collections`,
  entityGroups: [[getRootCollectionTreeItem(t`Root tenant collection`)]],
  filterPlaceholder: t`Search for a collection`,
});

export const getTenantSpecificCollectionEntity = (
  collections: Collection[],
  collectionId: CollectionId,
): Collection | undefined => {
  if (collectionId === ROOT_COLLECTION.id) {
    return getRootPermissionsCollection(collections, t`Root tenant collection`);
  }

  return findCollectionById(collections, collectionId) ?? undefined;
};

type TenantSpecificCollectionsPermissionEditorOpts = {
  permissions: CollectionPermissions;
  collection: Collection;
  groups: GroupInfo[];
};

export const getTenantSpecificCollectionsPermissionEditor = ({
  permissions,
  collection,
  groups,
}: TenantSpecificCollectionsPermissionEditorOpts): PermissionEditorType => {
  // Filter out tenant groups - they get implicit permissions based on tenant membership
  const nonTenantGroups = groups.filter(
    (group) => !PLUGIN_TENANTS.isTenantGroup(group),
  );

  const entities = nonTenantGroups
    .map((group) => {
      const isAdmin = isAdminGroup(group);

      const defaultGroup = _.find(nonTenantGroups, isDefaultGroup);

      const defaultGroupPermission = defaultGroup
        ? getCollectionPermission(permissions, defaultGroup.id, collection.id)
        : "none";

      if (!defaultGroup) {
        return null;
      }

      const confirmations = (newValue: DataPermissionValue) => [
        getPermissionWarningModal(
          newValue,
          defaultGroupPermission,
          null,
          defaultGroup,
          group.id,
        ),
      ];

      const options = [
        COLLECTION_OPTIONS.write,
        COLLECTION_OPTIONS.read,
        COLLECTION_OPTIONS.none,
      ];

      const disabled = isAdmin;

      return {
        id: group.id,
        name: getGroupNameLocalized(group),
        permissions: [
          {
            permission: DataPermission.COLLECTIONS,
            type: DataPermissionType.COLLECTIONS,
            // Always show toggle as checked and disabled for tenant-specific collections
            toggleLabel: t`Also change sub-collections`,
            hasChildren: true,
            toggleDisabled: true,
            toggleDefaultValue: true,
            isDisabled: disabled,
            disabledTooltip: disabled
              ? Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
              : null,
            value: getCollectionPermission(
              permissions,
              group.id,
              collection.id,
            ),
            warning: getCollectionWarning(group.id, collection, permissions),
            confirmations,
            options,
          },
        ],
      };
    })
    .filter(isNotNull);

  return {
    title: t`Permissions for ${collection.name}`,
    filterPlaceholder: t`Search for a group`,
    columns: [{ name: t`Group name` }, { name: t`Collection access` }],
    entities,
  };
};
