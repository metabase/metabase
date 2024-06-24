import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { isSameField } from "metabase-lib/v1/queries/utils/field-ref";
import type {
  Field,
  FieldId,
  FieldReference,
  ModelCacheRefreshStatus,
  TableColumnOrderSetting,
  TemplateTag,
} from "metabase-types/api";

type FieldMetadata = {
  id?: FieldId | FieldReference;
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

function isSupportedTemplateTagForModel(tag: TemplateTag) {
  return ["card", "snippet"].includes(tag.type);
}

function checkDatabaseSupportsModels(database?: Database | null) {
  return database && database.hasFeature("nested-queries");
}

export function checkDatabaseCanPersistDatasets(database?: Database | null) {
  return database && database.supportsPersistence() && database.isPersisted();
}

export function checkCanBeModel(question: Question) {
  if (!checkDatabaseSupportsModels(question.database())) {
    return false;
  }

  const { isNative } = Lib.queryDisplayInfo(question.query());

  if (!isNative) {
    return true;
  }

  return (question.legacyQuery() as NativeQuery)
    .templateTags()
    .every(isSupportedTemplateTagForModel);
}

export function isAdHocModelQuestion(
  question?: Question,
  originalQuestion?: Question,
) {
  if (!question || !originalQuestion) {
    return false;
  }

  const isModel =
    question.type() === "model" || originalQuestion.type() === "model";
  const isSameQuestion = question.id() === originalQuestion.id();
  const isSelfReferencing =
    Lib.sourceTableOrCardId(question.query()) ===
    getQuestionVirtualTableId(originalQuestion.id());

  return isModel && isSameQuestion && isSelfReferencing;
}

export function checkCanRefreshModelCache(
  refreshInfo: ModelCacheRefreshStatus,
) {
  if (refreshInfo.card_archived === true) {
    return false;
  }

  if (refreshInfo.card_type === "question") {
    return false;
  }

  return refreshInfo.state === "persisted" || refreshInfo.state === "error";
}

export function getModelCacheSchemaName(databaseId: number, siteUUID: string) {
  const uuidParts = siteUUID.split("-");
  const firstLetters = uuidParts.map(part => part.charAt(0)).join("");
  return `metabase_cache_${firstLetters}_${databaseId}`;
}

function getFieldIndexFromColumnVizSetting(
  column: Field,
  columnSettings: TableColumnOrderSetting[],
) {
  return columnSettings.findIndex(columnSetting => {
    // We have some corrupted visualization settings where both names are mixed
    // We should settle on `fieldRef`, make it required and remove `field_ref`
    const fieldRef = columnSetting.fieldRef || columnSetting.field_ref;
    return isSameField(column.field_ref, fieldRef);
  });
}

// Columns in resultsMetadata contain all the necessary metadata
// orderedColumns contain properly sorted columns, but they only contain field names and refs.
// Normally, columns in resultsMetadata are ordered too,
// but they only get updated after running a query (which is not triggered after reordering columns).
// This ensures metadata rich columns are sorted correctly not to break the "Tab" key navigation behavior.
export function getSortedModelFields(
  model: Question,
  columnMetadata: Field[] | undefined | null,
) {
  if (!Array.isArray(columnMetadata)) {
    return [];
  }

  const columnSettings = model.setting("table.columns");
  if (!Array.isArray(columnSettings)) {
    return columnMetadata;
  }

  // always return metadata columns even if the corresponding viz settings don't exist
  return columnMetadata
    .map(column => ({
      column,
      index: getFieldIndexFromColumnVizSetting(column, columnSettings),
    }))
    .sort((a, b) => a.index - b.index)
    .map(({ column }) => column);
}
