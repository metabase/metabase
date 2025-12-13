import { t } from "ttag";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { isNullOrUndefined } from "metabase/lib/types";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  CollectionNamespace,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import type { PickerState } from "../EntityPicker";

import type {
  CollectionPickerItem,
  CollectionPickerOptions,
  CollectionPickerStatePath,
} from "./CollectionPicker";

export const getNamespaceForItem = (
  item: Pick<CollectionPickerItem, "id" | "namespace"> | null | undefined,
): CollectionNamespace | undefined => {
  if (!item) {
    return undefined;
  }

  const tenantNamespace = PLUGIN_TENANTS.getNamespaceForTenantId(item.id);
  if (tenantNamespace) {
    return tenantNamespace as CollectionNamespace;
  }

  return item.namespace;
};

export const getCollectionIdPath = (
  collection: Pick<
    CollectionPickerItem,
    | "id"
    | "location"
    | "is_personal"
    | "effective_location"
    | "model"
    | "is_shared_tenant_collection"
    | "is_tenant_dashboard"
    | "type"
    | "namespace"
    | "collection_namespace"
    | "collection_id"
  > & {
    type?: Collection["type"];
  },
  userPersonalCollectionId?: CollectionId,
): CollectionId[] => {
  if (collection.id === null || collection.id === "root") {
    return ["root"];
  }

  if (collection.id === "databases") {
    return ["databases"];
  }

  const tenantPath = PLUGIN_TENANTS.getTenantCollectionPathPrefix(collection);
  if (tenantPath) {
    if (
      PLUGIN_TENANTS.isTenantCollectionId(collection.id) ||
      collection.type === "tenant-specific-root-collection"
    ) {
      return tenantPath;
    }
    const location = collection?.effective_location ?? collection?.location;
    const pathFromRoot: CollectionId[] =
      location?.split("/").filter(Boolean).map(Number) ?? [];
    const id =
      collection.model === "collection" ? collection.id : -collection.id;
    return [...tenantPath, ...pathFromRoot, id];
  }

  if (collection.type === "library") {
    return [collection.id];
  }

  if (collection.id === PERSONAL_COLLECTIONS.id) {
    return ["personal"];
  }

  if (typeof collection.id === "string") {
    console.error("Invalid collection id", collection.id);
    return [];
  }

  const location = collection?.effective_location ?? collection?.location;
  const pathFromRoot: CollectionId[] =
    location?.split("/").filter(Boolean).map(Number) ?? [];

  const isInUserPersonalCollection =
    userPersonalCollectionId &&
    (collection.id === userPersonalCollectionId ||
      pathFromRoot.includes(userPersonalCollectionId));

  const isInSemanticLayerCollection = collection?.type?.includes("library");

  const id = collection.model === "collection" ? collection.id : -collection.id;

  if (isInUserPersonalCollection) {
    return [...pathFromRoot, id];
  } else if (isInSemanticLayerCollection) {
    return [...pathFromRoot, id];
  } else if (collection.is_personal) {
    return ["personal", ...pathFromRoot, id];
  } else {
    return ["root", ...pathFromRoot, id];
  }
};

export const getStateFromIdPath = ({
  idPath,
  namespace,
  models,
}: {
  idPath: CollectionId[];
  namespace?: CollectionNamespace;
  models: CollectionItemModel[];
}): CollectionPickerStatePath => {
  const effectiveNamespace =
    PLUGIN_TENANTS.isTenantCollectionId(idPath[0]) &&
    PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE
      ? (PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE as CollectionNamespace)
      : namespace;

  const statePath: PickerState<
    CollectionPickerItem,
    ListCollectionItemsRequest
  > = [
    {
      selectedItem: {
        name: "",
        model: "collection",
        id: idPath[0],
        here: ["collection"],
        below: ["collection"],
        namespace: effectiveNamespace,
      },
    },
  ];

  idPath.forEach((id, index) => {
    const { entityId: nextLevelId, model: nextLevelModel } = resolveEntityId(
      idPath[index + 1],
    );

    const { entityId, model: entityModel, ...extra } = resolveEntityId(id);

    statePath.push({
      query: {
        id: entityId,
        models: ["collection", ...models],
        namespace: effectiveNamespace,
        ...extra,
      },
      entity: entityModel,
      selectedItem: nextLevelId
        ? {
            name: "",
            model: nextLevelModel,
            id: nextLevelId,
            here: ["collection"],
            below: ["collection"],
            namespace: effectiveNamespace,
          }
        : null,
    });
  });

  return statePath;
};

const resolveEntityId = (
  id: CollectionId,
): {
  model: "collection" | "dashboard";
  entityId: CollectionId;
} => {
  if (typeof id === "string" || isNullOrUndefined(id)) {
    return {
      entityId: id,
      model: "collection",
    };
  } else {
    const isDashboard = id < 0;

    return {
      entityId: Math.abs(id),
      model: isDashboard ? "dashboard" : "collection",
    };
  }
};

export const isNamespaceRoot = (item: CollectionPickerItem): boolean => {
  return PLUGIN_TENANTS.isTenantCollectionId(item.id);
};

export const shouldDisableItemForSavingModel = (
  item: CollectionPickerItem,
  savingModel?: CollectionPickerOptions["savingModel"],
): boolean => {
  if (savingModel === "collection") {
    return false;
  }

  return isNamespaceRoot(item);
};

export const getDisabledReasonForSavingModel = (
  item: CollectionPickerItem,
  savingModel?: CollectionPickerOptions["savingModel"],
): string | undefined => {
  if (!shouldDisableItemForSavingModel(item, savingModel)) {
    return undefined;
  }

  if (PLUGIN_TENANTS.isTenantCollectionId(item.id)) {
    const tenantReason = PLUGIN_TENANTS.getTenantRootDisabledReason();
    if (tenantReason) {
      return tenantReason;
    }
  }

  return t`Items cannot be saved to this collection.`;
};

export const canCollectionCardBeUsed = (
  item: CollectionItem | CollectionPickerItem,
): boolean => {
  if (item.model === "card") {
    return "can_run_adhoc_query" in item ? !!item.can_run_adhoc_query : true;
  }

  return true;
};
