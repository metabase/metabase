import _ from "underscore";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { isNullOrUndefined } from "metabase/lib/types";
import type {
  Card,
  CardType,
  CollectionId,
  CollectionItemModel,
} from "metabase-types/api";

import type {
  QuestionPickerItem,
  QuestionPickerStatePath,
  QuestionPickerValue,
  QuestionPickerValueModel,
} from "./types";

export const getCollectionIdPath = (
  collection: Pick<
    QuestionPickerItem,
    "id" | "location" | "is_personal" | "effective_location" | "model"
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

  const id = collection.model === "collection" ? collection.id : -collection.id;

  if (isInUserPersonalCollection) {
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
  models = ["card", "dataset"],
}: {
  idPath: CollectionId[];
  namespace?: "snippets";
  models?: CollectionItemModel[];
}): QuestionPickerStatePath => {
  const statePath: QuestionPickerStatePath = [
    {
      selectedItem: {
        name: "",
        model: "collection",
        id: idPath[0],
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

export const isFolder = (
  item: QuestionPickerItem,
  models: CollectionItemModel[],
) => {
  return (
    item.id === "root" ||
    item.is_personal ||
    ((item?.model === "collection" || item?.model === "dashboard") &&
      _.intersection([...(item?.below ?? []), ...(item?.here ?? [])], models)
        .length > 0)
  );
};

export const getQuestionPickerValue = ({
  id,
  type,
}: Pick<Card, "id" | "type">): QuestionPickerValue => {
  return { id, model: getQuestionPickerValueModel(type) };
};

export const getQuestionPickerValueModel = (
  type: CardType,
): QuestionPickerValueModel => {
  switch (type) {
    case "question":
      return "card";
    case "model":
      return "dataset";
    case "metric":
      return "metric";
  }
};
