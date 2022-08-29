import StructuredQuery from "../StructuredQuery";
import NativeQuery from "../NativeQuery";
import Table from "metabase-lib/lib/metadata/Table";
import { getQuestionIdFromVirtualTableId } from "metabase/lib/saved-questions";

import { createVirtualTable, createVirtualField } from "./virtual-table";

export function getNestedCardTable(structuredQuery: StructuredQuery): Table {
  const sourceTableId = structuredQuery.sourceTableId();
  const metadata = structuredQuery.metadata();

  const questionId = getQuestionIdFromVirtualTableId(sourceTableId);
  const sourceQuestion = metadata.question(questionId);

  if (sourceQuestion) {
    const sourceQuestionResultMetadata = sourceQuestion.getResultMetadata();
    const sourceQuestionQuery = sourceQuestion.query();
    const questionDisplayName = sourceQuestion.displayName() || "";

    const fields = sourceQuestionResultMetadata.map((fieldMetadata: any) => {
      const field = metadata.field(fieldMetadata.id);
      const virtualField = field
        ? field.merge(fieldMetadata)
        : createVirtualField({
            ...fieldMetadata,
            query: sourceQuestionQuery,
            metadata,
          });

      return virtualField;
    });

    return createVirtualTable({
      id: sourceTableId as string,
      name: questionDisplayName,
      display_name: questionDisplayName,
      db: sourceQuestion.database(),
      fields,
      metadata,
    });
  }

  // fallback to guarantee this function returns a Table
  return createVirtualTable({ metadata });
}

export function getDatasetTable(query: StructuredQuery | NativeQuery) {
  const question = query.question();
  const composedDatasetQuestion = question.composeDataset();

  return getNestedCardTable(composedDatasetQuestion.query() as StructuredQuery);
}
