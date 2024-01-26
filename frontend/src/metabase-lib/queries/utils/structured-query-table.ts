import type { FieldReference } from "metabase-types/api";
import * as Lib from "metabase-lib";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import type Field from "metabase-lib/metadata/Field";
import type Table from "metabase-lib/metadata/Table";
import type Question from "metabase-lib/Question";

import type StructuredQuery from "../StructuredQuery";
import { createVirtualTable, createVirtualField } from "./virtual-table";
import { getDatasetTable, getNestedCardTable } from "./nested-card-query-table";

export function getStructuredQueryTable(
  question: Question,
  legacyQuery: StructuredQuery,
): Table | null {
  const sourceQuery = legacyQuery.sourceQuery();
  // 1. Query has a source query. Use the source query as a table.
  if (sourceQuery) {
    return getSourceQueryTable(question, legacyQuery);
  }

  // 2. Query has a source table that is a nested card.
  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);
  if (isVirtualCardId(sourceTableId)) {
    return getNestedCardTable(question);
  }

  // 3. The query's question is a saved dataset.
  const isDataset = question.isDataset() && question.isSaved();
  if (isDataset) {
    return getDatasetTable(legacyQuery);
  }

  // 4. The query's table is a concrete table, assuming one exists in `metadata`.
  // Failure to find a table at this point indicates that there is a bug.
  return legacyQuery.metadata().table(sourceTableId);
}

function getFieldsForSourceQueryTable(
  originalQuery: StructuredQuery,
  sourceQuery: StructuredQuery,
): Field[] {
  const metadata = originalQuery.metadata();
  return sourceQuery.columns().map(column => {
    // Not sure why we build out `id` like this, but it's what the old code did
    const id: FieldReference = [
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

function getSourceQueryTable(
  question: Question,
  legacyQuery: StructuredQuery,
): Table | null {
  const sourceQuery = legacyQuery.sourceQuery() as StructuredQuery;
  const fields = getFieldsForSourceQueryTable(legacyQuery, sourceQuery);
  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);

  if (!sourceTableId) {
    return null;
  }

  return createVirtualTable({
    id: sourceTableId,
    db: question.database() ?? undefined,
    fields,
    metadata: sourceQuery.metadata(),
    // intentionally set these to "" so that we fallback to a title of "Previous results" in join steps
    display_name: "",
    name: "",
  });
}
