import { createSelector } from "reselect";
import { t } from "ttag";
import { getIn } from "icepick";
import _ from "underscore";

import Group from "metabase/entities/groups";
import { diffPermissions } from "metabase/lib/permissions";
import Collections, {
  getCollectionIcon,
  ROOT_COLLECTION,
} from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";
import { nonPersonalOrArchivedCollection } from "metabase/collections/utils";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";

import { COLLECTION_OPTIONS } from "../constants/collections-permissions";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "../constants/messages";
import { getPermissionWarningModal } from "./confirmations";

export const getIsDirty = createSelector(
  state => state.admin.permissions.collectionPermissions,
  state => state.admin.permissions.originalCollectionPermissions,
  (permissions, originalPermissions) =>
    JSON.stringify(permissions) !== JSON.stringify(originalPermissions),
);

export const getDiff = createSelector(
  Group.selectors.getList,
  state => state.admin.permissions.collectionPermissions,
  state => state.admin.permissions.originalCollectionPermissions,
  (groups, permissions, originalPermissions) =>
    diffPermissions(permissions, originalPermissions, groups),
);

export const getCurrentCollectionId = (_state, props) =>
  props.params.collectionId === ROOT_COLLECTION.id
    ? ROOT_COLLECTION.id
    : parseInt(props.params.collectionId);

const getRootCollectionTreeItem = () => {
  const rootCollectionIcon = getCollectionIcon(ROOT_COLLECTION);
  return {
    ...ROOT_COLLECTION,
    icon: rootCollectionIcon.name,
    iconColor: rootCollectionIcon.color,
  };
};

const getCollectionsTree = (state, _props) => {
  const collections =
    Collections.selectors.getList(state, {
      entityQuery: { tree: true },
    }) || [];
  const nonPersonalCollections = collections.filter(
    nonPersonalOrArchivedCollection,
  );

  return [
    getRootCollectionTreeItem(),
    ...buildCollectionTree(nonPersonalCollections),
  ];
};

export function buildCollectionTree(collections) {
  if (collections == null) {
    return [];
  }
  return collections.map(collection => {
    const icon = getCollectionIcon(collection);
    return {
      id: collection.id,
      name: collection.name,
      icon: icon.name,
      iconColor: icon.color,
      children: buildCollectionTree(collection.children),
    };
  });
}

export const getCollectionsSidebar = createSelector(
  getCollectionsTree,
  getCurrentCollectionId,
  (collectionsTree, collectionId) => {
    return {
      selectedId: collectionId,
      title: t`Collections`,
      entityGroups: [collectionsTree || []],
      filterPlaceholder: t`Search for a collection`,
    };
  },
);

const getCollectionsPermissions = state =>
  state.admin.permissions.collectionPermissions;

const findCollection = (collections, collectionId) => {
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
    collections.map(collection => collection.children).flat(),
    collectionId,
  );
};

const getCollection = (state, props) => {
  const collectionId = getCurrentCollectionId(state, props);
  const collections = Collections.selectors.getList(state, {
    entityQuery: { tree: true },
  });

  if (collectionId === ROOT_COLLECTION.id) {
    return {
      ...ROOT_COLLECTION,
      children: collections,
    };
  }

  return findCollection(collections, collectionId);
};

const getFolder = (state, props) => {
  const folderId = getCurrentCollectionId(state, props);
  const folders = SnippetCollections.selectors.getList(state);

  return folders.find(folder => folder.id === folderId);
};

export const getCollectionEntity = (state, props) => {
  return props.namespace === "snippets"
    ? getFolder(state, props)
    : getCollection(state, props);
};

const getCollectionPermission = (permissions, groupId, collectionId) =>
  getIn(permissions, [groupId, collectionId]);

const getNamespace = (_state, props) => props.namespace;

const getToggleLabel = namespace =>
  namespace === "snippets"
    ? t`Also change sub-folders`
    : t`Also change sub-collections`;

export const getCollectionsPermissionEditor = createSelector(
  getCollectionsPermissions,
  getCollectionEntity,
  Group.selectors.getList,
  getNamespace,
  (permissions, collection, groups, namespace) => {
    if (!permissions || collection == null) {
      return null;
    }

    const hasChildren = collection.children?.length > 0;
    const toggleLabel = hasChildren ? getToggleLabel(namespace) : null;
    const defaultGroup = _.find(groups, isDefaultGroup);

    const entities = groups.map(group => {
      const isAdmin = isAdminGroup(group);

      const defaultGroupPermission = getCollectionPermission(
        permissions,
        defaultGroup.id,
        collection.id,
      );

      const confirmations = newValue => [
        getPermissionWarningModal(
          newValue,
          defaultGroupPermission,
          null,
          defaultGroup,
          group.id,
        ),
      ];

      return {
        id: group.id,
        name: group.name,
        permissions: [
          {
            toggleLabel,
            isDisabled: isAdmin,
            disabledTooltip: isAdmin
              ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
              : null,
            value: getCollectionPermission(
              permissions,
              group.id,
              collection.id,
            ),
            warning: getCollectionWarning(group.id, collection, permissions),
            confirmations,
            options: [
              COLLECTION_OPTIONS.write,
              COLLECTION_OPTIONS.read,
              COLLECTION_OPTIONS.none,
            ],
          },
        ],
      };
    });

    return {
      title: t`Permissions for ${collection.name}`,
      filterPlaceholder: t`Search for a group`,
      columns: [`Group name`, t`Collection access`],
      entities,
    };
  },
);

const permissionsCollectionFilter = collection => !collection.is_personal;

function getDecendentCollections(collection) {
  const subCollections =
    collection.children?.filter(permissionsCollectionFilter) || [];
  return subCollections.concat(...subCollections.map(getDecendentCollections));
}

function getPermissionsSet(collections, permissions, groupId) {
  const perms = collections.map(collection =>
    getCollectionPermission(permissions, groupId, collection.id),
  );
  return new Set(perms);
}

function getCollectionWarning(groupId, collection, permissions) {
  if (!collection) {
    return;
  }
  const collectionPerm = getCollectionPermission(
    permissions,
    groupId,
    collection.id,
  );
  const descendentCollections = getDecendentCollections(collection);
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
