import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import {
  nonPersonalOrArchivedCollection,
  isInstanceAnalyticsCollection,
} from "metabase/collections/utils";
import Collections, {
  getCollectionIcon,
  ROOT_COLLECTION,
} from "metabase/entities/collections";
import Group from "metabase/entities/groups";
import SnippetCollections from "metabase/entities/snippet-collections";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import type {
  Collection,
  Group as GroupType,
  CollectionPermissions,
  CollectionId,
} from "metabase-types/api";
import type {
  State,
  ExpandedCollection,
  CollectionTreeItem,
} from "metabase-types/store";

import { COLLECTION_OPTIONS } from "../constants/collections-permissions";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "../constants/messages";
import type { DataPermissionValue } from "../types";

import { getPermissionWarningModal } from "./confirmations";

export const collectionsQuery = {
  tree: true,
  "exclude-other-user-collections": true,
  "exclude-archived": true,
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
  namespace?: string;
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

const getCollectionsTree = createSelector([getCollections], collections => {
  return [getRootCollectionTreeItem(), ...buildCollectionTree(collections)];
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
  entityGroups: [CollectionTreeItem[]];
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
    collection => collection.id === collectionId,
  );

  if (collection) {
    return collection;
  }

  return findCollection(
    collections.map(collection => collection.children ?? []).flat(),
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
) => getIn(permissions, [groupId, collectionId]);

const getNamespace = (_state: State, props: CollectionIdProps) =>
  props.namespace;

const getToggleLabel = (namespace?: string) =>
  namespace === "snippets"
    ? t`Also change sub-folders`
    : t`Also change sub-collections`;

export type CollectionPermissionEditorType = null | {
  title: string;
  filterPlaceholder: string;
  columns: [{ name: string }, { name: string }];
  entities: {
    id: number;
    name: string;
    permissions: {
      toggleLabel: string;
      hasChildren: boolean;
      isDisabled: boolean;
      disabledTooltip: string | null;
      value: string;
      warning: string | null;
      confirmations: (newValue: string) => string[];
      options: string[];
    }[];
  }[];
};

export const getCollectionsPermissionEditor = createSelector(
  getCollectionsPermissions,
  getCollectionEntity,
  Group.selectors.getList,
  getNamespace,
  (
    permissions,
    collection,
    groups,
    namespace,
  ): CollectionPermissionEditorType => {
    if (!permissions || collection == null) {
      return null;
    }

    const hasChildren = collection.children?.length > 0;
    const toggleLabel = hasChildren ? getToggleLabel(namespace) : null;
    const defaultGroup = _.find(groups, isDefaultGroup);

    const entities = groups.map((group: GroupType) => {
      const isAdmin = isAdminGroup(group);

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

      const options = isIACollection
        ? [COLLECTION_OPTIONS.read, COLLECTION_OPTIONS.none]
        : [
            COLLECTION_OPTIONS.write,
            COLLECTION_OPTIONS.read,
            COLLECTION_OPTIONS.none,
          ];

      const disabledTooltip = isIACollection
        ? PLUGIN_COLLECTIONS.INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE
        : UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;

      return {
        id: group.id,
        name: getGroupNameLocalized(group),
        permissions: [
          {
            toggleLabel,
            hasChildren,
            isDisabled: isAdmin,
            disabledTooltip: isAdmin ? disabledTooltip : null,
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
    });

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
  const perms = collections.map(collection =>
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
    return;
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
}
