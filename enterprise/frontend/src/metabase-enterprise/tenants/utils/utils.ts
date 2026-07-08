import { t } from "ttag";

import {
  type OmniPickerCollectionItem,
  type OmniPickerItem,
  isInDbTree,
} from "metabase/common/components/Pickers";
import type {
  Collection,
  CollectionItemModel,
  CollectionNamespace,
  Group,
  User,
} from "metabase-types/api";

import {
  SHARED_TENANT_NAMESPACE,
  TENANT_NAMESPACES,
  TENANT_SPECIFIC_NAMESPACE,
} from "./constants";

export const isExternalUsersGroup = (
  group: Pick<Group, "magic_group_type">,
) => {
  return group.magic_group_type === "all-external-users";
};

export const isTenantGroup = (group: Pick<Group, "is_tenant_group">) => {
  return !!group.is_tenant_group;
};

export const isExternalUser = (user?: Pick<User, "tenant_id">): boolean => {
  return Boolean(user && user.tenant_id !== null);
};

export const isTenantCollection = (
  collection: Partial<Pick<Collection, "namespace">>,
) => collection.namespace === "shared-tenant-collection";

const isRootCollection = (collection: OmniPickerCollectionItem): boolean => {
  return collection.id === "root" || collection.id === null;
};

export const canPlaceEntityInCollection = ({
  entityType,
  collection,
}: {
  entityType?: CollectionItemModel;
  collection: OmniPickerItem;
}): boolean => {
  if (!entityType) {
    return true;
  }
  if (isInDbTree(collection)) {
    return false;
  }

  if (
    !isRootCollection(collection) ||
    !isTenantNamespace(collection.namespace)
  ) {
    return true;
  }

  if (entityType === "collection") {
    // can create collections in shared tenant root, nothing
    return collection.namespace === SHARED_TENANT_NAMESPACE;
  }

  return false;
};

const isTenantNamespace = (namespace?: CollectionNamespace): boolean => {
  return !!(namespace && TENANT_NAMESPACES.includes(namespace));
};

export const getNamespaceDisplayName = (
  namespace?: CollectionNamespace,
): string | null => {
  if (namespace === SHARED_TENANT_NAMESPACE) {
    return t`Shared collections`;
  }
  return null;
};

export const getRootCollectionItem = ({
  namespace,
}: {
  namespace: CollectionNamespace;
}): OmniPickerCollectionItem | null => {
  if (namespace === SHARED_TENANT_NAMESPACE) {
    return {
      id: "root",
      name: t`Shared collections`,
      namespace: SHARED_TENANT_NAMESPACE,
      here: ["collection"],
      below: ["collection", "card", "dashboard"],
      model: "collection",
      location: "/",
    };
  }
  if (namespace === TENANT_SPECIFIC_NAMESPACE) {
    return {
      id: "root",
      name: t`Tenant collections`,
      namespace: TENANT_SPECIFIC_NAMESPACE,
      here: ["collection"],
      below: ["collection", "card", "dashboard"],
      model: "collection",
      can_write: false, // this is fake so it's always false
      location: "/",
    };
  }
  return null;
};
