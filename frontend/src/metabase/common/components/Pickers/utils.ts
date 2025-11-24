import { t } from "ttag";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { isNullOrUndefined } from "metabase/lib/types";
import type {
  Collection,
  CollectionId,
  CollectionItemModel,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import type { PickerState } from "../EntityPicker";

import type {
  CollectionPickerItem,
  CollectionPickerOptions,
  CollectionPickerStatePath,
} from "./CollectionPicker";

export const SHARED_TENANT_NAMESPACE = "shared-tenant-collection";

const isTenantNamespace = (namespace?: string): boolean => {
  return namespace === SHARED_TENANT_NAMESPACE;
};

/**
 * Gets the namespace for a collection item.
 * For namespace roots (like "tenant"), returns the corresponding namespace.
 * For regular collections, returns their namespace property.
 */
export const getNamespaceForItem = (
  item: Pick<CollectionPickerItem, "id" | "namespace"> | null | undefined,
): string | undefined => {
  if (!item) {
    return undefined;
  }

  // If the item is the tenant root, return the shared tenant namespace
  if (item.id === "tenant") {
    return SHARED_TENANT_NAMESPACE;
  }

  // Otherwise return the item's namespace
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
    | "is_tenant_collection"
    | "is_tenant_dashboard"
    | "type"
    | "namespace"
    | "collection_namespace"
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

  if (collection.id === "tenant") {
    return ["tenant"];
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

  // Check for tenant collection using namespace first, then fall back to boolean flags
  const isTenantCollection =
    isTenantNamespace(collection.namespace) ||
    isTenantNamespace(collection.collection_namespace) ||
    collection.is_tenant_collection ||
    collection.is_tenant_dashboard;

  if (isInUserPersonalCollection) {
    return [...pathFromRoot, id];
  } else if (isInSemanticLayerCollection) {
    return [...pathFromRoot, id];
  } else if (collection.is_personal) {
    return ["personal", ...pathFromRoot, id];
  } else if (isTenantCollection) {
    return ["tenant", ...pathFromRoot, id];
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
  namespace?: string;
  models: CollectionItemModel[];
}): CollectionPickerStatePath => {
  // Determine the effective namespace based on the path
  // If the path starts with "tenant", use the shared tenant namespace
  const effectiveNamespace =
    idPath[0] === "tenant" ? SHARED_TENANT_NAMESPACE : namespace;

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

/**
 * Checks if a collection item is a namespace root (like tenant root).
 * Namespace roots should only contain sub-collections, not actual content.
 */
export const isNamespaceRoot = (item: CollectionPickerItem): boolean => {
  // The tenant root has id "tenant" and namespace "shared-tenant-collection"
  if (item.id === "tenant") {
    return true;
  }

  // Future namespace roots could be detected by having a namespace but being
  // at the root level (no location or location is "/")
  return false;
};

/**
 * Checks if an item should be disabled based on the savingModel option.
 * Namespace roots are disabled when saving non-collection items.
 */
export const shouldDisableItemForSavingModel = (
  item: CollectionPickerItem,
  savingModel?: CollectionPickerOptions["savingModel"],
): boolean => {
  // If no savingModel specified, don't disable anything
  if (!savingModel) {
    return false;
  }

  // Collections can be saved anywhere
  if (savingModel === "collection") {
    return false;
  }

  // For other item types, disable namespace roots
  return isNamespaceRoot(item);
};

/**
 * Returns the reason why an item is disabled, for use in tooltips.
 */
export const getDisabledReasonForSavingModel = (
  item: CollectionPickerItem,
  savingModel?: CollectionPickerOptions["savingModel"],
): string | undefined => {
  if (!shouldDisableItemForSavingModel(item, savingModel)) {
    return undefined;
  }

  if (item.id === "tenant") {
    return t`Items cannot be saved directly to the tenant root collection. Please select a sub-collection.`;
  }

  return t`Items cannot be saved to this collection.`;
};
