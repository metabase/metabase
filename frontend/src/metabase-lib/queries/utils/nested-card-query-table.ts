import * as Lib from "metabase-lib";
import {
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";
import type Table from "metabase-lib/metadata/Table";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "../StructuredQuery";
import type NativeQuery from "../NativeQuery";
import { createVirtualField, createVirtualTable } from "./virtual-table";

// This function expects a `sourceTableId` to exist in the `metadata.table` cache
// It also expects the card associated with the `sourceTableId` to exist in the `metadata.question` cache
export function getNestedCardTable(question: Question): Table | null {
  const query = question.query();
  const metadata = question.metadata();
  const sourceTableId = Lib.sourceTableOrCardId(query);
  const nestedCardTable = metadata.table(sourceTableId);
  if (nestedCardTable) {
    return nestedCardTable;
  }

  const questionId = getQuestionIdFromVirtualTableId(sourceTableId);
  const nestedQuestion = metadata.question(questionId);
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
  legacyQuery: StructuredQuery | NativeQuery,
): Table | null {
  const question = legacyQuery.question();
  const composedDatasetQuestion = question.composeDataset();
  return getNestedCardTable(composedDatasetQuestion);
}

function createVirtualTableUsingQuestionMetadata(question: Question): Table {
  const metadata = question.metadata();
  const questionResultMetadata = question.getResultMetadata();
  const questionDisplayName = question.displayName() as string;
  const legacyQuery = question.legacyQuery({ useStructuredQuery: true }) as
    | StructuredQuery
    | NativeQuery;
  const fields = questionResultMetadata.map((fieldMetadata: any) => {
    const field = metadata.field(fieldMetadata.id);
    const virtualField = field
      ? field.clone(fieldMetadata)
      : createVirtualField(fieldMetadata);

    virtualField.query = legacyQuery;
    virtualField.metadata = metadata;

    return virtualField;
  });

  return createVirtualTable({
    id: getQuestionVirtualTableId(question.id()),
    name: questionDisplayName,
    display_name: questionDisplayName,
    db: question?.database() ?? undefined,
    fields,
    metadata,
  });
}
