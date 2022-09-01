import { getQuestionIdFromVirtualTableId } from "metabase/lib/saved-questions";
import type Table from "metabase-lib/lib/metadata/Table";
import type Field from "metabase-lib/lib/metadata/Field";
import type Question from "metabase-lib/lib/Question";
import type StructuredQuery from "../StructuredQuery";
import type NativeQuery from "../NativeQuery";
import {
  createVirtualField,
  createVirtualTable,
  createTableCloneWithOverridedMetadata,
} from "./virtual-table";

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

  // There are scenarios (and possible race conditions) in the application where
  // the nested card table might not be available, but if we have access to a Question
  // with result_metadata then we might as well use it to create virtual fields
  if (nestedQuestion) {
    return createVirtualTableUsingQuestionMetadata(nestedQuestion);
  }

  return null;
}

// Treat the Dataset/Model like a Question that uses itself as its source table
// Expects the Question to have been fetched as a virtual table
export function getDatasetTable(
  query: StructuredQuery | NativeQuery,
): Table | null {
  const question = query.question();
  const composedDatasetQuestion = question.composeDataset();
  const composedQuestionQuery =
    composedDatasetQuestion.query() as StructuredQuery;
  return getNestedCardTable(composedQuestionQuery);
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

function createVirtualTableUsingQuestionMetadata(question: Question): Table {
  const metadata = question.metadata();
  const questionResultMetadata = question.getResultMetadata();
  const questionDisplayName = question.displayName() as string;
  const query = question.query() as StructuredQuery;
  const sourceTableId = query.sourceTableId();
  const fields = questionResultMetadata.map((fieldMetadata: any) => {
    const field = metadata.field(fieldMetadata.id);
    const virtualField = field
      ? field.clone(fieldMetadata)
      : createVirtualField(fieldMetadata);

    virtualField.query = query;
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
