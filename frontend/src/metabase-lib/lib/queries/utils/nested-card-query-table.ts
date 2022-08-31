import { getQuestionIdFromVirtualTableId } from "metabase/lib/saved-questions";
import type Table from "metabase-lib/lib/metadata/Table";

import type StructuredQuery from "../StructuredQuery";
import type NativeQuery from "../NativeQuery";
import { createVirtualTable, createVirtualField } from "./virtual-table";

export function getNestedCardTable(
  structuredQuery: StructuredQuery,
): Table | null {
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

  // `card__123` tables are technically accessible via `metabase.table("card__123")`,
  // but the `fields` on the table may be incorrect.
  // see (metabase#25141)
  return metadata.table(sourceTableId);
}

export function getDatasetTable(
  query: StructuredQuery | NativeQuery,
): Table | null {
  const question = query.question();
  const composedDatasetQuestion = question.composeDataset();

  return getNestedCardTable(composedDatasetQuestion.query() as StructuredQuery);
}
