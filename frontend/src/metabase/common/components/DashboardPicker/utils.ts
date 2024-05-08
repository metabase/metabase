import _ from "underscore";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import type {
  CollectionId,
  CollectionItemModel,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import { getParentCollectionId } from "../CollectionPicker/utils";
import type { PickerState } from "../EntityPicker";

import type {
  DashboardPickerInitialValueItem,
  DashboardPickerItem,
} from "./types";

export const getCollectionIdPath = (
  collection: Pick<
    DashboardPickerItem,
    "id" | "location" | "is_personal" | "effective_location"
  >,
  userPersonalCollectionId?: CollectionId,
): CollectionId[] => {
  if (collection.id === "root" || collection.id === null) {
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
  models = ["card", "dataset"],
}: {
  idPath: CollectionId[];
  namespace?: "snippets";
  models?: CollectionItemModel[];
}): PickerState<DashboardPickerItem, ListCollectionItemsRequest> => {
  const statePath: PickerState<
    DashboardPickerItem,
    ListCollectionItemsRequest
  > = [
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
        id,
        models: ["collection", ...models],
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

export const getCollectionId = (
  item: DashboardPickerItem | DashboardPickerInitialValueItem | null,
): CollectionId => {
  if (!item) {
    return "root";
  }

  if (item.model === "collection") {
    return (item.id as CollectionId) ?? "root";
  }

  if ("location" in item) {
    return getParentCollectionId(item.effective_location ?? item.location);
  }

  return "root";
};

export const isFolder = (item: DashboardPickerItem) => {
  return (
    item.is_personal ||
    item.id === "root" ||
    (item?.model === "collection" &&
      _.intersection(
        [...(item?.below ?? []), ...(item?.here ?? [])],
        ["dashboard"],
      ).length > 0)
  );
};
