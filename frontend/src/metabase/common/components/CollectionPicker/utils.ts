import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import type {
  CollectionId,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import type { PickerState } from "../EntityPicker";
import type { QuestionPickerItem } from "../QuestionPicker";

import type { CollectionPickerItem } from "./types";

export const getCollectionIdPath = (
  collection: Pick<
    CollectionPickerItem,
    "id" | "location" | "is_personal" | "effective_location"
  >,
  userPersonalCollectionId?: CollectionId,
  isPersonal?: boolean,
): CollectionId[] => {
  if (collection.id === null || collection.id === "root") {
    return ["root"];
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

  if (isPersonal) {
    return ["personal", ...pathFromRoot, collection.id];
  } else if (isInUserPersonalCollection) {
    return [...pathFromRoot, collection.id];
  } else {
    return ["root", ...pathFromRoot, collection.id];
  }
};

export const getStateFromIdPath = ({
  idPath,
  namespace,
}: {
  idPath: CollectionId[];
  namespace?: "snippets";
}): PickerState<CollectionPickerItem, ListCollectionItemsRequest> => {
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
    const nextLevelId = idPath[index + 1] ?? null;

    statePath.push({
      query: {
        id,
        models: ["collection"],
        namespace,
      },
      selectedItem: nextLevelId
        ? {
            name: "",
            model: "collection",
            id: nextLevelId,
            here: ["collection"],
            below: ["collection"],
          }
        : null,
    });
  });

  return statePath;
};

export const isFolder = (item: CollectionPickerItem): boolean => {
  return Boolean(
    item.model === "collection" && item?.here?.includes("collection"),
  );
};

export const getParentCollectionId = (
  location?: string | null,
): CollectionId => {
  const parentCollectionId = location?.split("/").filter(Boolean).reverse()[0];
  return parentCollectionId ? Number(parentCollectionId) : "root";
};

export const getPathLevelForItem = (
  item: CollectionPickerItem | QuestionPickerItem,
  path: PickerState<
    CollectionPickerItem | QuestionPickerItem,
    ListCollectionItemsRequest
  >,
  userPersonalCollectionId?: CollectionId,
): number => {
  if (item.id === userPersonalCollectionId) {
    return 0;
  }

  const parentCollectionId =
    item.collection_id ??
    getParentCollectionId(item?.effective_location ?? item?.location);

  // set selected item at the correct level
  const pathLevel = path.findIndex(
    level => String(level?.query?.id) === String(parentCollectionId),
  );

  return pathLevel === -1 ? 0 : pathLevel;
};
