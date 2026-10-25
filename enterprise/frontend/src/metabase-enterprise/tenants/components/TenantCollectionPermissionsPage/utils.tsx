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
  buildCollectionTree,
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

export const tenantCollectionsQuery = {
  "exclude-other-user-collections": true,
  "exclude-archived": true,
  namespace: "shared-tenant-collection",
} as const;

export const getTenantCollectionsSidebar = (
  collections: Collection[],
  selectedId: CollectionId | undefined,
): CollectionSidebarType => ({
  selectedId,
  title: t`Shared collections`,
  entityGroups: [
    [
      getRootCollectionTreeItem(t`Root shared collection`),
      ...buildCollectionTree(collections),
    ],
  ],
  filterPlaceholder: t`Search for a collection`,
});

export const getTenantCollectionEntity = (
  collections: Collection[],
  collectionId: CollectionId,
): Collection | undefined => {
  if (collectionId === ROOT_COLLECTION.id) {
    return getRootPermissionsCollection(collections, t`Root shared collection`);
  }

  return findCollectionById(collections, collectionId) ?? undefined;
};

type TenantCollectionsPermissionEditorOpts = {
  permissions: CollectionPermissions;
  collection: Collection;
  groups: GroupInfo[];
};

export const getTenantCollectionsPermissionEditor = ({
  permissions,
  collection,
  groups,
}: TenantCollectionsPermissionEditorOpts): PermissionEditorType => {
  const hasChildren = (collection.children?.length ?? 0) > 0;
  const toggleLabel = hasChildren ? t`Also change sub-collections` : null;

  const entities = groups
    .map((group) => {
      const isAdmin = isAdminGroup(group);
      const isTenantGroup = PLUGIN_TENANTS.isTenantGroup(group);

      const defaultGroup = _.find(
        groups,
        isTenantGroup ? PLUGIN_TENANTS.isExternalUsersGroup : isDefaultGroup,
      );

      if (!defaultGroup) {
        return null;
      }

      const defaultGroupPermission = getCollectionPermission(
        permissions,
        defaultGroup.id,
        collection.id,
      );

      const confirmations = (newValue: DataPermissionValue) => [
        getPermissionWarningModal(
          newValue,
          defaultGroupPermission,
          null,
          defaultGroup,
          group.id,
        ),
      ];

      const options = isTenantGroup
        ? [COLLECTION_OPTIONS.read, COLLECTION_OPTIONS.none]
        : [
            COLLECTION_OPTIONS.write,
            COLLECTION_OPTIONS.read,
            COLLECTION_OPTIONS.none,
          ];

      const disabledTooltip = isTenantGroup
        ? Messages.EXTERNAL_USERS_NO_ACCESS_COLLECTION
        : Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;

      const disabled = isAdmin;

      return {
        id: group.id,
        name: getGroupNameLocalized(group),
        icon: isTenantGroup ? (
          <PLUGIN_TENANTS.TenantGroupHintIcon />
        ) : undefined,
        permissions: [
          {
            permission: DataPermission.COLLECTIONS,
            type: DataPermissionType.COLLECTIONS,
            toggleLabel,
            hasChildren,
            isDisabled: disabled,
            disabledTooltip: disabled ? disabledTooltip : null,
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
