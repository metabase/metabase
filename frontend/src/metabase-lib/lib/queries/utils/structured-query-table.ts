import type Field from "metabase-lib/lib/metadata/Field";
import type Table from "metabase-lib/lib/metadata/Table";
import type { Field as FieldRef } from "metabase-types/types/Query";

import { isVirtualCardId } from "metabase/lib/saved-questions";

import type StructuredQuery from "../StructuredQuery";
import { createVirtualTable, createVirtualField } from "./virtual-table";
import { getDatasetTable, getNestedCardTable } from "./nested-card-query-table";

export function getStructuredQueryTable(
  structuredQuery: StructuredQuery,
): Table | null {
  const sourceQuery = structuredQuery.sourceQuery();
  // 1. Query has a source query. Use the source query as a table.
  if (sourceQuery) {
    return getSourceQueryTable(sourceQuery);
  }

  // 2. Query has a source table that is a nested card.
  const sourceTableId = structuredQuery.sourceTableId();
  if (isVirtualCardId(sourceTableId)) {
    return getNestedCardTable(structuredQuery);
  }

  // 3. The query's question is a dataset.
  const question = structuredQuery.question();
  const isDataset = question?.isDataset() ?? false;
  if (isDataset) {
    return getDatasetTable(structuredQuery);
  }

  // 4. The query's table is a concrete table, assuming one exists in `metadata`.
  return structuredQuery.metadata().table(sourceTableId);
}

function getFieldsForSourceQueryTable(query: StructuredQuery): Field[] {
  const metadata = query.metadata();
  return query.columns().map(column => {
    // Not sure why we build out `id` like this, but it's what the old code did
    const id: FieldRef = [
      "field",
      column.name,
      {
        "base-type": column.base_type,
      },
    ];

    const virtualField = createVirtualField({
      ...column,
      id,
      query,
      metadata,
    });

    return virtualField;
  });
}

function getSourceQueryTable(sourceQuery: StructuredQuery): Table {
  const fields = getFieldsForSourceQueryTable(sourceQuery);

  return createVirtualTable({
    id: sourceQuery.sourceTableId() as number,
    db: sourceQuery.database(),
    fields,
    metadata: sourceQuery.metadata(),
  });
}
