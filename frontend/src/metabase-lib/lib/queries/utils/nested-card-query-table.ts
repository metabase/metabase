import { getQuestionIdFromVirtualTableId } from "metabase/lib/saved-questions";
import type Table from "metabase-lib/lib/metadata/Table";
import type Field from "metabase-lib/lib/metadata/Field";
import type Question from "metabase-lib/lib/Question";
import type StructuredQuery from "../StructuredQuery";
import type NativeQuery from "../NativeQuery";
import { createVirtualField, createVirtualTable } from "./virtual-table";

// This function expects a `sourceTableId` to exist in the `metadata.table` cache
// It also expects the card associated with the `sourceTableId` to exist in the `metadata.question` cache
export function getNestedCardTable(query: StructuredQuery): Table | null {
  const sourceTableId = query.sourceTableId();
  const metadata = query.metadata();

  const questionId = getQuestionIdFromVirtualTableId(sourceTableId);
  const nestedQuestion = metadata.question(questionId);

  const nestedCardTable = metadata.table(sourceTableId);
  if (nestedCardTable) {
    const fields = getNestedCardFieldsWithOverridedMetadata(
      nestedCardTable,
      nestedQuestion,
      query,
    );

    return createTableCloneWithOverridedMetadata(nestedCardTable, fields);
  }

  return null;
}

// Treat the Dataset/Model like a Question that uses itself as its source table
// Expects the Question to have been fetched as a virtual table
export function getDatasetTable(
  query: StructuredQuery | NativeQuery,
): Table | null {
  const question = query.question();
  const metadata = query.metadata();
  const composedDatasetQuestion = question.composeDataset();
  const composedQuestionQuery =
    composedDatasetQuestion.query() as StructuredQuery;

  // This probably isn't loaded into state yet, but worth checking because
  // the Table will have more field metadata on it than the question's result_metadata alone
  const nestedCardSourceTableId = composedQuestionQuery.sourceTableId();
  if (metadata.table(nestedCardSourceTableId)) {
    return getNestedCardTable(composedQuestionQuery);
  }

  return createVirtualTableUsingQuestionMetadata(
    composedDatasetQuestion,
    composedQuestionQuery,
  );
}

// Using the `nestedCardTable` fields as a base, override the field object with matching metadata found in the Question's result_metadata array
// This process should become unnecessary once we fix metabase#25141
function getNestedCardFieldsWithOverridedMetadata(
  nestedCardTable: Table,
  nestedQuestion: Question | null,
  query: StructuredQuery,
): Field[] {
  const questionResultMetadata = nestedQuestion?.getResultMetadata() || [];
  const fields = nestedCardTable.fields.map(field => {
    const fieldMetadata = questionResultMetadata.find((fieldMetadata: any) => {
      return (
        isEqualAndDefined(field.id, fieldMetadata.id) ||
        isEqualAndDefined(field.name, fieldMetadata.name)
      );
    });

    const clonedField = field.clone({
      ...fieldMetadata,
      source: "nested",
    });
    clonedField.query = query;
    return clonedField;
  });

  return fields;
}

function isEqualAndDefined(a: unknown, b: unknown): boolean {
  return a != null && b != null && a === b;
}

function createTableCloneWithOverridedMetadata(
  nestedCardTable: Table,
  fields: Field[],
): Table {
  const clonedTable = nestedCardTable.clone();
  clonedTable.fields = fields;
  clonedTable.getPlainObject().fields = fields.map(field => field.id);
  return clonedTable;
}

function createVirtualTableUsingQuestionMetadata(
  question: Question,
  originalQuery: StructuredQuery,
): Table {
  const metadata = question.metadata();
  const questionResultMetadata = question.getResultMetadata();
  const questionDisplayName = question.displayName() as string;
  const sourceTableId = originalQuery.sourceTableId();
  const fields = questionResultMetadata.map((fieldMetadata: any) => {
    const field = metadata.field(fieldMetadata.id);
    const virtualField = field
      ? field.clone(fieldMetadata)
      : createVirtualField(fieldMetadata);

    virtualField.query = originalQuery;
    virtualField.metadata = metadata;

    return virtualField;
  });

  return createVirtualTable({
    id: sourceTableId as string,
    name: questionDisplayName,
    display_name: questionDisplayName,
    db: question?.database(),
    fields,
    metadata,
  });
}
