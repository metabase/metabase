import { isRootCollection } from "metabase/collections/utils";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import type {
  CollectionId,
  SearchRequest,
  SearchModelType,
} from "metabase-types/api";

import type { PickerState } from "../EntityPicker";

import type { CollectionPickerItem } from "./types";

export const getCollectionIdPath = (
  collection: Pick<
    CollectionPickerItem,
    "id" | "location" | "is_personal" | "effective_location"
  >,
  userPersonalCollectionId?: CollectionId,
  isPersonal?: boolean,
): CollectionId[] => {
  if (isRootCollection(collection)) {
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
}): PickerState<CollectionPickerItem, SearchRequest> => {
  const statePath: PickerState<CollectionPickerItem, SearchRequest> = [
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
        collection: id,
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

export const generateKey = (query?: SearchRequest) =>
  JSON.stringify(query ?? "root");

export const getParentCollectionId = (
  location: string | null,
): CollectionId => {
  const parentCollectionId = location?.split("/").filter(Boolean).reverse()[0];
  return parentCollectionId ? Number(parentCollectionId) : "root";
};

export const getPathLevelForItem = (
  item: CollectionPickerItem,
  path: PickerState<CollectionPickerItem, SearchListQuery>,
  userPersonalCollectionId?: CollectionId,
): number => {
  if (item.id === userPersonalCollectionId) {
    return 0;
  }

  const parentCollectionId = item?.collection_id || "root";

  // set selected item at the correct level
  return path.findIndex(
    level => String(level?.query?.collection) === String(parentCollectionId),
  );
};
