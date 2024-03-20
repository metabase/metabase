import { isRootCollection } from "metabase/collections/utils";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import type { PickerState, TisFolder, TypeWithModel } from "../../types";

import type { NotebookDataPickerItem } from "./types";

export const getCollectionIdPath = (
  collection: NotebookDataPickerItem,
  userPersonalCollectionId?: NotebookDataPickerItem["id"],
): NotebookDataPickerItem["id"][] => {
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
  const pathFromRoot: NotebookDataPickerItem["id"][] =
    location?.split("/").filter(Boolean).map(Number) ?? [];

  const isInUserPersonalCollection =
    userPersonalCollectionId &&
    (collection.id === userPersonalCollectionId ||
      pathFromRoot.includes(userPersonalCollectionId));

  if (isInUserPersonalCollection) {
    return [...pathFromRoot, collection.id];
  } else if (collection.is_personal) {
    return ["personal", ...pathFromRoot, collection.id];
  } else {
    return ["root", ...pathFromRoot, collection.id];
  }
};

export const getStateFromIdPath = ({
  idPath,
  namespace,
}: {
  idPath: NotebookDataPickerItem["id"][];
  namespace?: "snippets";
}): PickerState<NotebookDataPickerItem> => {
  const statePath: PickerState<NotebookDataPickerItem> = [
    {
      selectedItem: {
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
        ? { model: "collection", id: nextLevelId }
        : null,
    });
  });

  return statePath;
};

export const isFolder: TisFolder<NotebookDataPickerItem> = <
  TItem extends TypeWithModel,
>(
  item: TItem,
) => item.model === "database";
