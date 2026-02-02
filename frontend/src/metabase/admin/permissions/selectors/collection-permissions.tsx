import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import {
  isInstanceAnalyticsCollection,
  isLibraryCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import {
  Collections,
  ROOT_COLLECTION,
  getCollectionIcon,
} from "metabase/entities/collections";
import { Groups } from "metabase/entities/groups";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import {
  getGroupNameLocalized,
  getGroupSortOrder,
  getSpecialGroupType,
  isDefaultGroup,
} from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_COLLECTIONS, PLUGIN_TENANTS } from "metabase/plugins";
import type {
  Collection,
  CollectionId,
  CollectionNamespace,
  CollectionPermissions,
  Group as GroupType,
} from "metabase-types/api";
import type {
  CollectionTreeItem,
  ExpandedCollection,
  State,
} from "metabase-types/store";

import { COLLECTION_OPTIONS } from "../constants/collections-permissions";
import { Messages } from "../constants/messages";
import {
  DataPermission,
  DataPermissionType,
  type DataPermissionValue,
  type PermissionEditorType,
  type SpecialGroupType,
} from "../types";

import { getPermissionWarningModal } from "./confirmations";

export const collectionsQuery = {
  tree: true,
  "exclude-other-user-collections": true,
  "exclude-archived": true,
  "include-library": true,
};

export const getIsDirty = createSelector(
  (state: State) => state.admin.permissions.collectionPermissions,
  (state: State) => state.admin.permissions.originalCollectionPermissions,
  (
    permissions: CollectionPermissions,
    originalPermissions: CollectionPermissions,
  ) => JSON.stringify(permissions) !== JSON.stringify(originalPermissions),
);

export type CollectionIdProps = {
  params: { collectionId: CollectionId };
  namespace?: CollectionNamespace;
};

export const getCurrentCollectionId = (
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

const getRootCollectionTreeItem = () => {
  const rootCollectionIcon = getCollectionIcon(ROOT_COLLECTION);
  return {
    ...ROOT_COLLECTION,
    icon: rootCollectionIcon.name,
    iconColor: rootCollectionIcon.color,
  };
};

const getCollections = (state: State) =>
  (
    Collections.selectors.getList(state, {
      entityQuery: collectionsQuery,
    }) ?? []
  ).filter(nonPersonalOrArchivedCollection);

const getCollectionsTree = createSelector([getCollections], (collections) => {
  const libraryCollections = collections.filter(isLibraryCollection);
  const nonLibraryCollections = collections.filter(
    (collection: Collection) => !isLibraryCollection(collection),
  );

  return [
    ...buildCollectionTree(libraryCollections),
    getRootCollectionTreeItem(),
    ...buildCollectionTree(nonLibraryCollections),
  ];
});

export function buildCollectionTree(
  collections: Collection[] | null,
): CollectionTreeItem[] {
  if (collections == null) {
    return [];
  }
  return collections.map((collection: Collection) => {
    return {
      id: collection.id,
      name: collection.name,
      icon: getCollectionIcon(collection),
      children: collection?.children
        ? buildCollectionTree(collection.children)
        : [],
    };
  });
}

export type CollectionSidebarType = {
  selectedId?: CollectionId;
  title: string;
  entityGroups: CollectionTreeItem[][];
  filterPlaceholder: string;
};

export const getCollectionsSidebar = createSelector(
  getCollectionsTree,
  getCurrentCollectionId,
  (collectionsTree, collectionId): CollectionSidebarType => {
    return {
      selectedId: collectionId,
      title: t`Collections`,
      entityGroups: [collectionsTree || []],
      filterPlaceholder: t`Search for a collection`,
    };
  },
);

const getCollectionsPermissions = (state: State) =>
  state.admin.permissions.collectionPermissions;

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

const getCollection = createSelector(
  [getCurrentCollectionId, getCollections],
  (collectionId, collections) => {
    if (collectionId == null) {
      return null;
    }

    if (collectionId === ROOT_COLLECTION.id) {
      return {
        ...ROOT_COLLECTION,
        children: collections,
      };
    }

    return findCollection(collections, collectionId);
  },
);

const getFolder = (state: State, props: CollectionIdProps) => {
  const folderId = getCurrentCollectionId(state, props);
  const folders = SnippetCollections.selectors.getList(state);

  return folders.find((folder: Collection) => folder.id === folderId);
};

export const getCollectionEntity = (state: State, props: CollectionIdProps) => {
  return props.namespace === "snippets"
    ? getFolder(state, props)
    : getCollection(state, props);
};

const getCollectionPermission = (
  permissions: CollectionPermissions,
  groupId: number,
  collectionId: CollectionId,
) => getIn(permissions, [groupId, collectionId]) || "none";

const getNamespace = (_state: State, props: CollectionIdProps) =>
  props.namespace;

const getToggleLabel = (namespace?: CollectionNamespace) =>
  namespace === "snippets"
    ? t`Also change sub-folders`
    : t`Also change sub-collections`;

const getCollectionDisabledTooltip = (
  groupType: SpecialGroupType,
  isLibrary: boolean,
  isIACollection: boolean,
): string | null => {
  if (groupType === "admin" && isIACollection) {
    return PLUGIN_COLLECTIONS.INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE;
  }
  if (groupType === "analyst" && isLibrary) {
    return Messages.UNABLE_TO_CHANGE_DATA_ANALYST_LIBRARY_PERMISSIONS;
  }
  switch (groupType) {
    case "admin":
      return Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
    case "external":
      return Messages.EXTERNAL_USERS_NO_ACCESS_COLLECTION;
    default:
      return null;
  }
};

export const getCollectionsPermissionEditor = createSelector(
  getCollectionsPermissions,
  getCollectionEntity,
  Groups.selectors.getList,
  getNamespace,
  (permissions, collection, groups, namespace): PermissionEditorType | null => {
    if (!permissions || collection == null) {
      return null;
    }

    const hasChildren = collection.children?.length > 0;
    const toggleLabel = hasChildren ? getToggleLabel(namespace) : null;
    const isTenantCollection = PLUGIN_TENANTS.isTenantCollection(collection);

    const sortedGroups = [...groups].sort(
      (a, b) => getGroupSortOrder(a) - getGroupSortOrder(b),
    );

    const entities = sortedGroups
      .map((group: GroupType) => {
        const isExternalUsersGroup = PLUGIN_TENANTS.isExternalUsersGroup(group);
        const isTenantGroup = PLUGIN_TENANTS.isTenantGroup(group);
        const isExternal = isExternalUsersGroup || isTenantGroup;
        const groupType = getSpecialGroupType(group, isExternal);
        const isLibrary = isLibraryCollection(collection);
        const defaultGroup = _.find(
          groups,
          isExternalUsersGroup
            ? PLUGIN_TENANTS.isExternalUsersGroup
            : isDefaultGroup,
        );

        if (isTenantGroup && !isTenantCollection) {
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

        const isIACollection = isInstanceAnalyticsCollection(collection);

        const options =
          isIACollection || (isTenantCollection && isExternal)
            ? [COLLECTION_OPTIONS.read, COLLECTION_OPTIONS.none]
            : [
                COLLECTION_OPTIONS.write,
                COLLECTION_OPTIONS.read,
                COLLECTION_OPTIONS.none,
              ];

        const disabledTooltip = getCollectionDisabledTooltip(
          groupType,
          isLibrary,
          isIACollection,
        );

        const isDisabled =
          (!isTenantCollection && isExternal) || disabledTooltip !== null;

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
              isDisabled,
              disabledTooltip,
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

function getPermissionsSet(
  collections: Collection[],
  permissions: CollectionPermissions,
  groupId: number,
) {
  const perms = collections.map((collection) =>
    getCollectionPermission(permissions, groupId, collection.id),
  );
  return new Set(perms);
}

function getCollectionWarning(
  groupId: number,
  collection: ExpandedCollection,
  permissions: CollectionPermissions,
) {
  if (!collection) {
    return null;
  }
  const collectionPerm = getCollectionPermission(
    permissions,
    groupId,
    collection.id,
  );
  const descendentCollections = getDescendentCollections(collection);
  const descendentPerms = getPermissionsSet(
    descendentCollections,
    permissions,
    groupId,
  );
  if (
    collectionPerm === "none" &&
    (descendentPerms.has("read") || descendentPerms.has("write"))
  ) {
    return t`This group has permission to view at least one subcollection of this collection.`;
  } else if (collectionPerm === "read" && descendentPerms.has("write")) {
    return t`This group has permission to edit at least one subcollection of this collection.`;
  }

  return null;
}
