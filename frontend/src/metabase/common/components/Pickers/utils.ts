import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { isNullOrUndefined } from "metabase/lib/types";
import type {
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import type { PickerState } from "../EntityPicker";

import type {
  CollectionPickerItem,
  CollectionPickerStatePath,
} from "./CollectionPicker";

export const getCollectionIdPath = (
  collection: Pick<
    CollectionPickerItem,
    "id" | "location" | "is_personal" | "effective_location" | "model" | "type"
  >,
  userPersonalCollectionId?: CollectionId,
): CollectionId[] => {
  if (collection.id === null || collection.id === "root") {
    return ["root"];
  }

  if (collection.id === "databases") {
    return ["databases"];
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
  namespace?: "snippets";
  models: CollectionItemModel[];
}): CollectionPickerStatePath => {
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
      },
    },
  ];

  idPath.forEach((id, index) => {
    const { entityId: nextLevelId, model: nextLevelModel } = resolveEntityId(
      idPath[index + 1],
    );

    const { entityId, model: entityModel } = resolveEntityId(id);

    statePath.push({
      query: {
        id: entityId,
        models: ["collection", ...models],
        namespace,
      },
      entity: entityModel,
      selectedItem: nextLevelId
        ? {
            name: "",
            model: nextLevelModel,
            id: nextLevelId,
            here: ["collection"],
            below: ["collection"],
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

export const canCollectionCardBeUsed = (
  item: CollectionItem | CollectionPickerItem,
): boolean => {
  if (item.model === "card") {
    return "can_run_adhoc_query" in item ? !!item.can_run_adhoc_query : true;
  }

  return true;
};
