import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import Database from "metabase-lib/lib/metadata/Database";

import { isStructured } from "metabase/lib/query";
import { getQuestionVirtualTableId } from "metabase/lib/saved-questions";
import MetabaseSettings from "metabase/lib/settings";

import { ModelCacheRefreshStatus } from "metabase-types/api";
import { TemplateTag } from "metabase-types/types/Query";
import {
  Card as CardObject,
  CardId,
  StructuredDatasetQuery,
} from "metabase-types/types/Card";

export function isSupportedTemplateTagForModel(tag: TemplateTag) {
  return ["card", "snippet"].includes(tag.type);
}

export function checkDatabaseSupportsModels(database?: Database | null) {
  return database && database.hasFeature("nested-queries");
}

export function checkDatabaseCanPersistDatasets(database?: Database | null) {
  return database && database.supportsPersistence() && database.isPersisted();
}

export function checkCanBeModel(question: Question) {
  const query = question.query();

  if (!checkDatabaseSupportsModels(query.database())) {
    return false;
  }

  if (!question.isNative()) {
    return true;
  }

  return (query as NativeQuery)
    .templateTags()
    .every(isSupportedTemplateTagForModel);
}

type Card = CardObject & {
  id?: CardId;
  dataset?: boolean;
};

export function isAdHocModelQuestionCard(card: Card, originalCard?: Card) {
  if (!originalCard || !isStructured(card.dataset_query)) {
    return false;
  }

  const isModel = card.dataset || originalCard.dataset;
  const isSameCard = card.id === originalCard.id;
  const { query } = card.dataset_query as StructuredDatasetQuery;
  const isSelfReferencing =
    query["source-table"] === getQuestionVirtualTableId(originalCard);

  return isModel && isSameCard && isSelfReferencing;
}

export function isAdHocModelQuestion(
  question: Question,
  originalQuestion?: Question,
) {
  if (!originalQuestion) {
    return false;
  }
  return isAdHocModelQuestionCard(question.card(), originalQuestion.card());
}

export function checkCanRefreshModelCache(
  refreshInfo: ModelCacheRefreshStatus,
) {
  if (refreshInfo.card_archived === true) {
    return false;
  }

  if (refreshInfo.card_dataset === false) {
    return false;
  }

  return refreshInfo.state === "persisted" || refreshInfo.state === "error";
}

export function getModelCacheSchemaName(databaseId: number) {
  const siteUUID = MetabaseSettings.get("site-uuid") as string;
  const uuidParts = siteUUID.split("-");
  const firstLetters = uuidParts.map(part => part.charAt(0)).join("");
  return `metabase_cache_${firstLetters}_${databaseId}`;
}
