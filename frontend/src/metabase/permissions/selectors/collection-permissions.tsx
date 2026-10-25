import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  getCollectionIcon,
  isInstanceAnalyticsCollection,
  isLibraryCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/common/collections/utils";
import { findCollectionById } from "metabase/common/utils/collections";
import {
  getGroupNameLocalized,
  getGroupSortOrder,
  getSpecialGroupType,
  isDefaultGroup,
} from "metabase/common/utils/groups";
import { PLUGIN_COLLECTIONS, PLUGIN_TENANTS } from "metabase/plugins";
import type {
  CollectionTreeItem,
  ExpandedCollection,
} from "metabase/redux/store";
import { isNotNull } from "metabase/utils/types";
import {
  type Collection,
  type CollectionId,
  type CollectionNamespace,
  type CollectionPermissions,
  DataPermission,
  DataPermissionType,
  type DataPermissionValue,
  type GroupInfo,
  type SpecialGroupType,
} from "metabase-types/api";

import { COLLECTION_OPTIONS } from "../constants/collections-permissions";
import { Messages } from "../constants/messages";
import type { PermissionEditorType } from "../types";

import { getPermissionWarningModal } from "./confirmations";

export const collectionsQuery = {
  "exclude-other-user-collections": true,
  "exclude-archived": true,
  "include-library": true,
} as const;

export const parseCollectionIdParam = (
  collectionId: string | undefined,
): CollectionId | undefined => {
  if (collectionId == null) {
    return undefined;
  }

  return collectionId === ROOT_COLLECTION.id
    ? ROOT_COLLECTION.id
    : parseInt(collectionId);
};

const getRootCollectionTreeItem = () => {
  const rootCollectionIcon = getCollectionIcon(ROOT_COLLECTION);
  return {
    ...ROOT_COLLECTION,
    icon: rootCollectionIcon.name,
    iconColor: rootCollectionIcon.color,
  };
};

const getCollections = (collections: Collection[]) =>
  collections.filter(nonPersonalOrArchivedCollection);

const getCollectionsTree = (collections: Collection[]) => {
  const libraryCollections = collections.filter(isLibraryCollection);
  const nonLibraryCollections = collections.filter(
    (collection: Collection) => !isLibraryCollection(collection),
  );

  return [
    ...buildCollectionTree(libraryCollections),
    getRootCollectionTreeItem(),
    ...buildCollectionTree(nonLibraryCollections),
  ];
};

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

export const getCollectionsSidebar = (
  collections: Collection[],
  selectedId: CollectionId | undefined,
): CollectionSidebarType => ({
  selectedId,
  title: t`Collections`,
  entityGroups: [getCollectionsTree(getCollections(collections))],
  filterPlaceholder: t`Search for a collection`,
});

export const getPermissionsCollection = (
  collections: Collection[],
  collectionId: CollectionId,
): Collection | undefined => {
  const permissionsCollections = getCollections(collections);
  if (collectionId === ROOT_COLLECTION.id) {
    return {
      ...ROOT_COLLECTION,
      description: null,
      can_write: true,
      can_restore: false,
      can_delete: false,
      namespace: null,
      children: permissionsCollections,
    };
  }

  return findCollectionById(permissionsCollections, collectionId) ?? undefined;
};

const FOLDER_NAMESPACES: CollectionNamespace[] = ["snippets", "data-actions"];

export const isFolderNamespace = (namespace?: CollectionNamespace) =>
  FOLDER_NAMESPACES.includes(namespace ?? null);

const getCollectionPermission = (
  permissions: CollectionPermissions,
  groupId: number,
  collectionId: CollectionId,
) => getIn(permissions, [groupId, collectionId]) || "none";

const ADMIN_ONLY_WRITE_NAMESPACE_HINTS: Partial<
  Record<NonNullable<CollectionNamespace>, () => string>
> = {
  "data-actions": () => Messages.ONLY_ADMINS_CAN_CURATE_DATA_ACTIONS,
  "data-apps": () => Messages.ONLY_ADMINS_CAN_CURATE_DATA_APPS,
};

const getAdminOnlyWriteHint = (namespace?: CollectionNamespace) =>
  namespace != null
    ? ADMIN_ONLY_WRITE_NAMESPACE_HINTS[namespace]?.()
    : undefined;

const isAdminOnlyWriteNamespace = (namespace?: CollectionNamespace) =>
  getAdminOnlyWriteHint(namespace) != null;

type CollectionOptionsOpts = {
  value: DataPermissionValue;
  isIACollection: boolean;
  isAdminOnlyWrite: boolean;
  isTenantCollection: boolean;
  isExternal: boolean;
};

const canCurate = ({
  value,
  isIACollection,
  isAdminOnlyWrite,
  isTenantCollection,
  isExternal,
}: CollectionOptionsOpts) =>
  !isIACollection &&
  !(isAdminOnlyWrite && value !== COLLECTION_OPTIONS.write.value) &&
  !(isTenantCollection && isExternal);

const getCollectionOptions = (opts: CollectionOptionsOpts) =>
  canCurate(opts)
    ? [
        COLLECTION_OPTIONS.write,
        COLLECTION_OPTIONS.read,
        COLLECTION_OPTIONS.none,
      ]
    : [COLLECTION_OPTIONS.read, COLLECTION_OPTIONS.none];

const getCollectionAccessColumn = (namespace?: CollectionNamespace) => {
  const hint = getAdminOnlyWriteHint(namespace);
  return { name: t`Collection access`, ...(hint != null && { hint }) };
};

const getToggleLabel = (namespace?: CollectionNamespace) =>
  isFolderNamespace(namespace)
    ? t`Also change sub-folders`
    : t`Also change sub-collections`;

const getCollectionDisabledTooltip = (
  groupType: SpecialGroupType,
  isLibrary: boolean,
  isIACollection: boolean,
): string | null => {
  if (groupType === "admin" && isIACollection) {
    return PLUGIN_COLLECTIONS.getInstanceAnalyticsAdminReadonlyMessage();
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

type CollectionsPermissionEditorOpts = {
  permissions: CollectionPermissions;
  collection: Collection;
  groups: GroupInfo[];
  namespace?: CollectionNamespace;
};

export const getCollectionsPermissionEditor = ({
  permissions,
  collection,
  groups,
  namespace,
}: CollectionsPermissionEditorOpts): PermissionEditorType => {
  const hasChildren = (collection.children?.length ?? 0) > 0;
  const toggleLabel = hasChildren ? getToggleLabel(namespace) : null;
  const isAdminOnlyWrite = isAdminOnlyWriteNamespace(namespace);
  const isTenantCollection = PLUGIN_TENANTS.isTenantCollection(collection);

  const sortedGroups = [...groups].sort(
    (a, b) => getGroupSortOrder(a) - getGroupSortOrder(b),
  );

  const entities = sortedGroups
    .map((group) => {
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

      const isIACollection = isInstanceAnalyticsCollection(collection);
      const value = getCollectionPermission(
        permissions,
        group.id,
        collection.id,
      );

      const options = getCollectionOptions({
        value,
        isIACollection,
        isAdminOnlyWrite,
        isTenantCollection,
        isExternal,
      });

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
            value,
            warning: getCollectionWarning(
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
    columns: [{ name: t`Group name` }, getCollectionAccessColumn(namespace)],
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
