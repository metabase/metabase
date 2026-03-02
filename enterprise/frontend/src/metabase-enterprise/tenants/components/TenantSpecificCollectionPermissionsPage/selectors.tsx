import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { COLLECTION_OPTIONS } from "metabase/admin/permissions/constants/collections-permissions";
import { Messages } from "metabase/admin/permissions/constants/messages";
import type {
  CollectionIdProps,
  CollectionPermissionEditorType,
  CollectionSidebarType,
} from "metabase/admin/permissions/selectors/collection-permissions";
import { getPermissionWarningModal } from "metabase/admin/permissions/selectors/confirmations";
import type { DataPermissionValue } from "metabase/admin/permissions/types";
import { findCollectionById } from "metabase/common/utils/collections";
import {
  Collections,
  ROOT_COLLECTION,
  getCollectionIcon,
} from "metabase/entities/collections";
import { Groups } from "metabase/entities/groups";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type {
  CollectionId,
  CollectionPermissions,
  Group as GroupType,
} from "metabase-types/api";
import type { ExpandedCollection, State } from "metabase-types/store";

export const tenantSpecificCollectionsQuery = {
  tree: true,
  "exclude-other-user-collections": true,
  "exclude-archived": true,
  namespace: "tenant-specific",
};

export const getIsTenantSpecificDirty = createSelector(
  (state: State) => state.admin.permissions.tenantSpecificCollectionPermissions,
  (state: State) =>
    state.admin.permissions.originalTenantSpecificCollectionPermissions,
  (
    permissions: CollectionPermissions,
    originalPermissions: CollectionPermissions,
  ) => !_.isEqual(permissions, originalPermissions),
);

export const getCurrentTenantSpecificCollectionId = (
  _state: State,
  props: CollectionIdProps,
) => {
  if (props.params.collectionId == null) {
    return undefined;
  }

  // collectionId comes from the route param and is either "root" or a numeric string
  return props.params.collectionId === ROOT_COLLECTION.id
    ? ROOT_COLLECTION.id
    : parseInt(String(props.params.collectionId));
};

const getTenantSpecificRootCollectionTreeItem = () => {
  const rootCollectionIcon = getCollectionIcon(ROOT_COLLECTION);
  return {
    ...ROOT_COLLECTION,
    name: t`Root tenant collection`,
    icon: rootCollectionIcon.name,
    iconColor: rootCollectionIcon.color,
  };
};

const getTenantSpecificCollections = (state: State) =>
  Collections.selectors.getList(state, {
    entityQuery: tenantSpecificCollectionsQuery,
  }) ?? [];

const getTenantSpecificCollectionsTree = () => {
  // Only show the single "Root tenant collection" in the sidebar
  return [getTenantSpecificRootCollectionTreeItem()];
};

export const getTenantSpecificCollectionsSidebar = createSelector(
  getTenantSpecificCollectionsTree,
  getCurrentTenantSpecificCollectionId,
  (collectionsTree, collectionId): CollectionSidebarType => {
    return {
      selectedId: collectionId,
      title: t`Tenant collections`,
      entityGroups: [collectionsTree || []],
      filterPlaceholder: t`Search for a collection`,
    };
  },
);

const getTenantSpecificCollectionsPermissions = (state: State) =>
  state.admin.permissions.tenantSpecificCollectionPermissions;

const getTenantSpecificCollection = createSelector(
  [getCurrentTenantSpecificCollectionId, getTenantSpecificCollections],
  (collectionId, collections) => {
    if (collectionId == null) {
      return null;
    }

    if (collectionId === ROOT_COLLECTION.id) {
      return {
        ...ROOT_COLLECTION,
        name: t`Root tenant collection`,
        children: collections,
      };
    }

    return findCollectionById(collections, collectionId);
  },
);

export const getTenantSpecificCollectionEntity = (
  state: State,
  props: CollectionIdProps,
) => {
  return getTenantSpecificCollection(state, props);
};

const getTenantSpecificCollectionPermission = (
  permissions: CollectionPermissions,
  groupId: number,
  collectionId: CollectionId,
) => getIn(permissions, [groupId, collectionId]) || "none";

export const getTenantSpecificCollectionsPermissionEditor = createSelector(
  getTenantSpecificCollectionsPermissions,
  getTenantSpecificCollectionEntity,
  Groups.selectors.getList,
  (permissions, collection, groups): CollectionPermissionEditorType => {
    if (!permissions || collection == null) {
      return null;
    }

    // Filter out tenant groups - they get implicit permissions based on tenant membership
    const nonTenantGroups = groups.filter(
      (group: GroupType) => !PLUGIN_TENANTS.isTenantGroup(group),
    );

    const entities = nonTenantGroups
      .map((group: GroupType) => {
        const isAdmin = isAdminGroup(group);

        const defaultGroup = _.find(nonTenantGroups, isDefaultGroup);

        const defaultGroupPermission = defaultGroup
          ? getTenantSpecificCollectionPermission(
              permissions,
              defaultGroup.id,
              collection.id,
            )
          : "none";

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
                collection as ExpandedCollection,
                permissions,
              ),
              confirmations,
              options,
            },
          ],
        };
      })
      .filter(Boolean);

    return {
      title: t`Permissions for ${collection.name}`,
      filterPlaceholder: t`Search for a group`,
      columns: [{ name: t`Group name` }, { name: t`Collection access` }],
      entities,
    };
  },
);

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
