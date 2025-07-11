import _ from "underscore";

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
