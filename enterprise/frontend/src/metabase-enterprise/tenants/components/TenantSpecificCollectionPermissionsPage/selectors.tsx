import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { getCollectionIcon } from "metabase/common/collections/utils";
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
  getPermissionWarningModal,
} from "metabase/permissions";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { ExpandedCollection } from "metabase/redux/store";
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

const getTenantSpecificRootCollectionTreeItem = () => {
  const rootCollectionIcon = getCollectionIcon(ROOT_COLLECTION);
  return {
    ...ROOT_COLLECTION,
    name: t`Root tenant collection`,
    icon: rootCollectionIcon.name,
    iconColor: rootCollectionIcon.color,
  };
};

export const getTenantSpecificCollectionsSidebar = (
  selectedId: CollectionId | undefined,
): CollectionSidebarType => ({
  selectedId,
  title: t`Tenant collections`,
  entityGroups: [[getTenantSpecificRootCollectionTreeItem()]],
  filterPlaceholder: t`Search for a collection`,
});

export const getTenantSpecificCollectionEntity = (
  collections: Collection[],
  collectionId: CollectionId,
): Collection | undefined => {
  if (collectionId === ROOT_COLLECTION.id) {
    return {
      ...ROOT_COLLECTION,
      name: t`Root tenant collection`,
      description: null,
      can_write: true,
      can_restore: false,
      can_delete: false,
      namespace: null,
      children: collections,
    };
  }

  return findCollectionById(collections, collectionId) ?? undefined;
};

const getTenantSpecificCollectionPermission = (
  permissions: CollectionPermissions,
  groupId: number,
  collectionId: CollectionId,
) => getIn(permissions, [groupId, collectionId]) || "none";

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
        ? getTenantSpecificCollectionPermission(
            permissions,
            defaultGroup.id,
            collection.id,
          )
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
            value: getTenantSpecificCollectionPermission(
              permissions,
              group.id,
              collection.id,
            ),
            warning: getTenantSpecificCollectionWarning(
              group.id,
              // Unjustified type cast. FIXME
              collection as ExpandedCollection,
              permissions,
            ),
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

const permissionsCollectionFilter = (collection: ExpandedCollection) =>
  !collection.is_personal;

function getDescendentCollections(
  collection: ExpandedCollection,
): ExpandedCollection[] {
  const subCollections =
    collection.children?.filter(permissionsCollectionFilter) || [];
  return subCollections.concat(...subCollections.map(getDescendentCollections));
}

function getTenantSpecificCollectionWarning(
  groupId: number,
  collection: ExpandedCollection,
  permissions: CollectionPermissions,
) {
  if (!collection) {
    return;
  }
  const collectionPerm = getTenantSpecificCollectionPermission(
    permissions,
    groupId,
    collection.id,
  );
  const descendentCollections = getDescendentCollections(collection);
  const descendentPerms = new Set(
    descendentCollections.map((c) =>
      getTenantSpecificCollectionPermission(permissions, groupId, c.id),
    ),
  );
  if (
    collectionPerm === "none" &&
    (descendentPerms.has("read") || descendentPerms.has("write"))
  ) {
    return t`This group has permission to view at least one subcollection of this collection.`;
  } else if (collectionPerm === "read" && descendentPerms.has("write")) {
    return t`This group has permission to edit at least one subcollection of this collection.`;
  }
}
