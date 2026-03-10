import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { COLLECTION_OPTIONS } from "metabase/admin/permissions/constants/collections-permissions";
import { Messages } from "metabase/admin/permissions/constants/messages";
import type {
  CollectionIdProps,
  CollectionSidebarType,
} from "metabase/admin/permissions/selectors/collection-permissions";
import { buildCollectionTree } from "metabase/admin/permissions/selectors/collection-permissions";
import { getPermissionWarningModal } from "metabase/admin/permissions/selectors/confirmations";
import type {
  DataPermissionValue,
  PermissionEditorType,
} from "metabase/admin/permissions/types";
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
  Collection,
  CollectionId,
  CollectionPermissions,
  Group as GroupType,
} from "metabase-types/api";
import type { ExpandedCollection, State } from "metabase-types/store";

export const tenantCollectionsQuery = {
  tree: true,
  "exclude-other-user-collections": true,
  "exclude-archived": true,
  namespace: "shared-tenant-collection",
};

export const getIsTenantDirty = createSelector(
  (state: State) => state.admin.permissions.tenantCollectionPermissions,
  (state: State) => state.admin.permissions.originalTenantCollectionPermissions,
  (
    permissions: CollectionPermissions,
    originalPermissions: CollectionPermissions,
  ) => JSON.stringify(permissions) !== JSON.stringify(originalPermissions),
);

export const getCurrentTenantCollectionId = (
  _state: State,
  props: CollectionIdProps,
) => {
  if (props.params.collectionId == null) {
    return undefined;
  }

  return props.params.collectionId === ROOT_COLLECTION.id
    ? ROOT_COLLECTION.id
    : parseInt(String(props.params.collectionId));
};

const getTenantRootCollectionTreeItem = () => {
  const rootCollectionIcon = getCollectionIcon(ROOT_COLLECTION);
  return {
    ...ROOT_COLLECTION,
    name: t`Root shared collection`,
    icon: rootCollectionIcon.name,
    iconColor: rootCollectionIcon.color,
  };
};

const getTenantCollections = (state: State) =>
  Collections.selectors.getList(state, {
    entityQuery: tenantCollectionsQuery,
  }) ?? [];

const getTenantCollectionsTree = createSelector(
  [getTenantCollections],
  (collections) => {
    return [
      getTenantRootCollectionTreeItem(),
      ...buildCollectionTree(collections),
    ];
  },
);

export const getTenantCollectionsSidebar = createSelector(
  getTenantCollectionsTree,
  getCurrentTenantCollectionId,
  (collectionsTree, collectionId): CollectionSidebarType => {
    return {
      selectedId: collectionId,
      title: t`Shared collections`,
      entityGroups: [collectionsTree || []],
      filterPlaceholder: t`Search for a collection`,
    };
  },
);

const getTenantCollectionsPermissions = (state: State) =>
  state.admin.permissions.tenantCollectionPermissions;

const findCollection = (
  collections: Collection[],
  collectionId: CollectionId,
): Collection | null => {
  if (collections.length === 0) {
    return null;
  }

  const collection = collections.find(
    (collection) => collection.id === collectionId,
  );

  if (collection) {
    return collection;
  }

  return findCollection(
    collections.map((collection) => collection.children ?? []).flat(),
    collectionId,
  );
};

const getTenantCollection = createSelector(
  [getCurrentTenantCollectionId, getTenantCollections],
  (collectionId, collections) => {
    if (collectionId == null) {
      return null;
    }

    if (collectionId === ROOT_COLLECTION.id) {
      return {
        ...ROOT_COLLECTION,
        name: t`Root shared collection`,
        children: collections,
      };
    }

    return findCollection(collections, collectionId);
  },
);

export const getTenantCollectionEntity = (
  state: State,
  props: CollectionIdProps,
) => {
  return getTenantCollection(state, props);
};

const getTenantCollectionPermission = (
  permissions: CollectionPermissions,
  groupId: number,
  collectionId: CollectionId,
) => getIn(permissions, [groupId, collectionId]) || "none";

export const getTenantCollectionsPermissionEditor = createSelector(
  getTenantCollectionsPermissions,
  getTenantCollectionEntity,
  Groups.selectors.getList,
  (permissions, collection, groups): PermissionEditorType | null => {
    if (!permissions || collection == null) {
      return null;
    }

    const hasChildren = collection.children?.length > 0;
    const toggleLabel = hasChildren ? t`Also change sub-collections` : null;

    const entities = groups
      .map((group: GroupType) => {
        const isAdmin = isAdminGroup(group);
        const isTenantGroup = PLUGIN_TENANTS.isTenantGroup(group);

        const defaultGroup = _.find(
          groups,
          isTenantGroup ? PLUGIN_TENANTS.isExternalUsersGroup : isDefaultGroup,
        );

        const defaultGroupPermission = defaultGroup
          ? getTenantCollectionPermission(
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
              toggleLabel,
              hasChildren,
              isDisabled: disabled,
              disabledTooltip: disabled ? disabledTooltip : null,
              value: getTenantCollectionPermission(
                permissions,
                group.id,
                collection.id,
              ),
              warning: getTenantCollectionWarning(
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

function getTenantCollectionWarning(
  groupId: number,
  collection: ExpandedCollection,
  permissions: CollectionPermissions,
) {
  if (!collection) {
    return;
  }
  const collectionPerm = getTenantCollectionPermission(
    permissions,
    groupId,
    collection.id,
  );
  const descendentCollections = getDescendentCollections(collection);
  const descendentPerms = new Set(
    descendentCollections.map((c) =>
      getTenantCollectionPermission(permissions, groupId, c.id),
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
