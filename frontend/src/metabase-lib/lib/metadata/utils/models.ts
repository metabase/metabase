import { TemplateTag } from "metabase-types/types/Query";
import { ModelCacheRefreshStatus } from "metabase-types/api";
import {
  Card as CardObject,
  CardId,
  StructuredDatasetQuery,
} from "metabase-types/types/Card";
import { getQuestionVirtualTableId } from "metabase-lib/lib/metadata/utils/saved-questions";
import Database from "metabase-lib/lib/metadata/Database";
import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { isStructured } from "metabase-lib/lib/queries/utils";

export type FieldMetadata = {
  id?: number;
  name: string;
  display_name: string;
  description?: string | null;
  semantic_type?: string | null;
};

const MAX_FIELD_SCORE = 3;

/**
 * Calculates field metadata completeness score for individual column
 *
 * Score is an int value between 0 and 3
 * (where 0 is fully incomplete metadata and 1 is fully complete one)
 *
 * Each score "point" is granted when one of the requirements is met
 *
 * 1. No "→" and "_" characters in column name
 * 2. Field description is provided
 * 3. Field semantic type is set
 *
 * @param {FieldMetadata} field
 * @returns {number} — int between 0 and 3
 */
function getFieldMetadataScore({
  display_name,
  description,
  semantic_type,
}: FieldMetadata): number {
  let score = 0;

  const isNameDirty = display_name.includes("→") || display_name.includes("_");

  if (!isNameDirty) {
    score++;
  }
  if (description) {
    score++;
  }
  if (semantic_type) {
    score++;
  }

  return score;
}

/**
 * Calculates overall metadata completeness percent among given a list of field metadata
 *
 * @param {FieldMetadata[]}
 * @returns {number} — percent value between 0 and 1
 */
export function getDatasetMetadataCompletenessPercentage(
  fieldsMetadata: FieldMetadata[],
): number {
  if (!Array.isArray(fieldsMetadata) || fieldsMetadata.length === 0) {
    return 0;
  }

  const MAX_POINTS = MAX_FIELD_SCORE * fieldsMetadata.length;
  const points = fieldsMetadata
    .map(getFieldMetadataScore)
    .reduce((sum, fieldPoints) => sum + fieldPoints, 0);

  const percent = points / MAX_POINTS;
  return Math.round(percent * 100) / 100;
}

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

export type Card = CardObject & {
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

export function getModelCacheSchemaName(databaseId: number, siteUUID: string) {
  const uuidParts = siteUUID.split("-");
  const firstLetters = uuidParts.map(part => part.charAt(0)).join("");
  return `metabase_cache_${firstLetters}_${databaseId}`;
}
