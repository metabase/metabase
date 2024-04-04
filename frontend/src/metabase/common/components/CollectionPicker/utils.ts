import { isRootCollection } from "metabase/collections/utils";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import type {
  CollectionId,
  SearchRequest,
  SearchModelType,
} from "metabase-types/api";

import type { PickerState, IsFolder, TypeWithModel } from "../EntityPicker";

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
          }
        : null,
    });
  });

  return statePath;
};

export const isFolder: IsFolder<
  CollectionId,
  SearchModelType,
  CollectionPickerItem
> = <Item extends TypeWithModel<CollectionId, SearchModelType>>(item: Item) => {
  return item.model === "collection";
};

export const generateKey = (query?: SearchRequest) =>
  JSON.stringify(query ?? "root");
