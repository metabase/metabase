import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import Database from "metabase-lib/lib/metadata/Database";
import { isStructured } from "metabase/lib/query";
import { getQuestionVirtualTableId } from "metabase/lib/saved-questions";
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
