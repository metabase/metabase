import type { Field as FieldRef } from "metabase-types/types/Query";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import type Field from "metabase-lib/metadata/Field";
import type Table from "metabase-lib/metadata/Table";

import type StructuredQuery from "../StructuredQuery";
import { createVirtualTable, createVirtualField } from "./virtual-table";
import { getDatasetTable, getNestedCardTable } from "./nested-card-query-table";

export function getStructuredQueryTable(query: StructuredQuery): Table | null {
  const sourceQuery = query.sourceQuery();
  // 1. Query has a source query. Use the source query as a table.
  if (sourceQuery) {
    return getSourceQueryTable(query);
  }

  // 2. Query has a source table that is a nested card.
  const sourceTableId = query.sourceTableId();
  if (isVirtualCardId(sourceTableId)) {
    return getNestedCardTable(query);
  }

  // 3. The query's question is a saved dataset.
  const question = query.question();
  const isDataset = question?.isDataset() && question.isSaved();
  if (isDataset) {
    return getDatasetTable(query);
  }

  // 4. The query's table is a concrete table, assuming one exists in `metadata`.
  // Failure to find a table at this point indicates that there is a bug.
  return query.metadata().table(sourceTableId);
}

function getFieldsForSourceQueryTable(
  originalQuery: StructuredQuery,
  sourceQuery: StructuredQuery,
): Field[] {
  const metadata = originalQuery.metadata();
  return sourceQuery.columns().map(column => {
    // Not sure why we build out `id` like this, but it's what the old code did
    const id: FieldRef = [
      "field",
      column.name,
      {
        "base-type": column.base_type as string,
      },
    ];

    const virtualField = createVirtualField({
      ...column,
      id,
      source: "fields",
      query: originalQuery,
      metadata,
    });

    return virtualField;
  });
}

function getSourceQueryTable(query: StructuredQuery): Table {
  const sourceQuery = query.sourceQuery() as StructuredQuery;
  const fields = getFieldsForSourceQueryTable(query, sourceQuery);
  const sourceTableId = sourceQuery.sourceTableId() as Table["id"];

  return createVirtualTable({
    id: sourceTableId,
    db: sourceQuery.database(),
    fields,
    metadata: sourceQuery.metadata(),
    // intentionally set these to "" so that we fallback to a title of "Previous results" in join steps
    display_name: "",
    name: "",
  });
}
