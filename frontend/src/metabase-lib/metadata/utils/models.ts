import {
  Card,
  DatasetColumn,
  FieldReference,
  ModelCacheRefreshStatus,
  TableColumnOrderSetting,
  TemplateTag,
  StructuredDatasetQuery,
} from "metabase-types/api";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";
import Database from "metabase-lib/metadata/Database";
import Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import { isSameField } from "metabase-lib/queries/utils/field-ref";
import { isStructured } from "metabase-lib/queries/utils";

type FieldMetadata = {
  id?: number | string;
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

export function isAdHocModelQuestionCard(card: Card, originalCard?: Card) {
  if (!originalCard || !isStructured(card.dataset_query)) {
    return false;
  }

  const isModel = card.dataset || originalCard.dataset;
  const isSameCard = card.id === originalCard.id;
  const { query } = card.dataset_query as StructuredDatasetQuery;
  const isSelfReferencing =
    query["source-table"] === getQuestionVirtualTableId(originalCard.id);

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

type QueryField = FieldReference & { field_ref: FieldReference };

function getFieldFromColumnVizSetting(
  columnVizSetting: TableColumnOrderSetting,
  columns: DatasetColumn[],
  columnMetadata: QueryField[],
) {
  // We have some corrupted visualization settings where both names are mixed
  // We should settle on `fieldRef`, make it required and remove `field_ref`
  const fieldRef = columnVizSetting.fieldRef || columnVizSetting.field_ref;
  return (
    columns.find(column => isSameField(column.field_ref, fieldRef)) ||
    columnMetadata.find(column => isSameField(column.field_ref, fieldRef))
  );
}

// Columns in resultsMetadata contain all the necessary metadata
// orderedColumns contain properly sorted columns, but they only contain field names and refs.
// Normally, columns in resultsMetadata are ordered too,
// but they only get updated after running a query (which is not triggered after reordering columns).
// This ensures metadata rich columns are sorted correctly not to break the "Tab" key navigation behavior.
export function getSortedModelFields(
  model: Question,
  columnMetadata?: QueryField[],
) {
  if (!Array.isArray(columnMetadata)) {
    return [];
  }

  const orderedColumns = model.setting("table.columns");

  if (!Array.isArray(orderedColumns)) {
    return columnMetadata;
  }

  const table = model.table();
  const tableFields = table?.fields ?? [];
  const tableColumns = tableFields.map(field => field.column());

  return orderedColumns
    .map(columnVizSetting =>
      getFieldFromColumnVizSetting(
        columnVizSetting,
        tableColumns,
        columnMetadata,
      ),
    )
    .filter(Boolean);
}
