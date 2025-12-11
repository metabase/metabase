import { getIn } from "icepick";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { PLUGIN_COLLECTIONS, PLUGIN_TENANTS } from "metabase/plugins";
import type {
  Collection,
  CollectionId,
  CollectionPermissions,
  Group,
  GroupId,
  GroupInfo,
} from "metabase-types/api";

import { COLLECTION_OPTIONS } from "../constants/collections-permissions";
import { Messages } from "../constants/messages";
import type { CollectionPermissionsConfig } from "../pages/CollectionPermissionsPage/types";
import { getPermissionWarningModal } from "../selectors/confirmations";
import type { DataPermissionValue } from "../types";

type ConfirmationModal = {
  title: string;
  message: string;
  confirmButtonText: string;
  cancelButtonText: string;
};

type PermissionOption = {
  label: string;
  value: string;
  icon: string;
  iconColor: string;
};

export type CollectionPermissionEditorType = null | {
  title: string;
  filterPlaceholder: string;
  columns: { name: string }[];
  entities: {
    id: GroupId;
    name: string;
    icon?: ReactNode;
    permissions: {
      toggleLabel: string | null;
      hasChildren: boolean;
      isDisabled: boolean;
      disabledTooltip: string | null;
      value: string;
      warning: string | undefined;
      confirmations: (
        newValue: DataPermissionValue,
      ) => (ConfirmationModal | undefined)[];
      options: PermissionOption[];
    }[];
  }[];
};

function getCollectionPermission(
  permissions: CollectionPermissions,
  groupId: GroupId,
  collectionId: CollectionId,
): string {
  return getIn(permissions, [groupId, collectionId]) || "none";
}

function getDescendantCollections(collection: Collection): Collection[] {
  const subCollections =
    collection.children?.filter((c) => !c.is_personal) || [];
  return subCollections.flatMap((c) => [c, ...getDescendantCollections(c)]);
}

function getCollectionWarning(
  groupId: GroupId,
  collection: Collection,
  permissions: CollectionPermissions,
): string | undefined {
  if (!collection) {
    return undefined;
  }

  const collectionPerm = getCollectionPermission(
    permissions,
    groupId,
    collection.id,
  );
  const descendantCollections = getDescendantCollections(collection);
  const descendantPerms = new Set(
    descendantCollections.map((c) =>
      getCollectionPermission(permissions, groupId, c.id),
    ),
  );

  if (
    collectionPerm === "none" &&
    (descendantPerms.has("read") || descendantPerms.has("write"))
  ) {
    return t`This group has permission to view at least one subcollection of this collection.`;
  } else if (collectionPerm === "read" && descendantPerms.has("write")) {
    return t`This group has permission to edit at least one subcollection of this collection.`;
  }

  return undefined;
}

export function useCollectionPermissionsEditor(
  config: CollectionPermissionsConfig,
  collection: Collection | null,
  groups: GroupInfo[],
  permissions: CollectionPermissions,
): CollectionPermissionEditorType {
  return useMemo(() => {
    if (!collection) {
      return null;
    }

    const hasChildren = (collection.children?.length ?? 0) > 0;
    const toggleLabel = hasChildren ? t`Also change sub-collections` : null;

    // Ensure collection has namespace and type for plugin checks
    const collectionWithDefaults = {
      ...collection,
      namespace: collection.namespace ?? null,
      type: collection.type ?? null,
    } as Collection;

    const isTenantCollection = PLUGIN_TENANTS.isTenantCollection(
      collectionWithDefaults,
    );

    const entities = groups
      .map((group) => {
        const isAdmin = isAdminGroup(group);
        const isExternal = PLUGIN_TENANTS.isExternalUsersGroup(group);
        const isTenantGroup = PLUGIN_TENANTS.isTenantGroup(group);

        // Filter tenant groups from non-tenant collections if configured
        if (
          config.filterTenantGroupsFromNonTenantCollections &&
          isTenantGroup &&
          !isTenantCollection
        ) {
          return null;
        }

        const defaultGroup = _.find(
          groups,
          isExternal ? PLUGIN_TENANTS.isExternalUsersGroup : isDefaultGroup,
        );

        const defaultGroupPermission = defaultGroup
          ? getCollectionPermission(permissions, defaultGroup.id, collection.id)
          : "none";

        const confirmations = (newValue: DataPermissionValue) => [
          getPermissionWarningModal(
            newValue,
            defaultGroupPermission as DataPermissionValue,
            null,
            // Cast is safe: getPermissionWarning handles undefined and GroupInfo has id/name
            defaultGroup as unknown as Group,
            group.id,
          ),
        ];

        const isIACollection =
          config.handleInstanceAnalytics &&
          isInstanceAnalyticsCollection(collectionWithDefaults);

        const options =
          isIACollection ||
          (isTenantCollection && (isTenantGroup || isExternal))
            ? [COLLECTION_OPTIONS.read, COLLECTION_OPTIONS.none]
            : [
                COLLECTION_OPTIONS.write,
                COLLECTION_OPTIONS.read,
                COLLECTION_OPTIONS.none,
              ];

        const disabledTooltip = isIACollection
          ? PLUGIN_COLLECTIONS.INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE
          : isTenantGroup || isExternal
            ? Messages.EXTERNAL_USERS_NO_ACCESS_COLLECTION
            : Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;

        const disabled =
          (config.filterTenantGroupsFromNonTenantCollections &&
            !isTenantCollection &&
            (isTenantGroup || isExternal)) ||
          isAdmin;

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
              disabledTooltip: isAdmin || isExternal ? disabledTooltip : null,
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
      .filter(
        Boolean,
      ) as NonNullable<CollectionPermissionEditorType>["entities"];

    return {
      title: t`Permissions for ${collection.name}`,
      filterPlaceholder: t`Search for a group`,
      columns: [{ name: t`Group name` }, { name: t`Collection access` }],
      entities,
    };
  }, [collection, groups, permissions, config]);
}
