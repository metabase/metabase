import { memo, useMemo } from "react";
import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import * as Lib from "metabase-lib";
import type {
  DatabaseId,
  FieldId,
  FieldReference,
  Table,
} from "metabase-types/api";

interface Props {
  databaseId: DatabaseId;
  fieldId: FieldId;
  table: Table;
}

const STAGE_INDEX = 0;

const FilteringPreviewBase = ({ databaseId, fieldId, table }: Props) => {
  const query = useMemo(
    () => getPreviewQuery(table, databaseId),
    [databaseId, table],
  );
  const column = useMemo(
    () => getPreviewColumn(query, fieldId),
    [fieldId, query],
  );

  return (
    <FilterPickerBody
      autoFocus={false}
      column={column}
      query={query}
      stageIndex={STAGE_INDEX}
      withSubmitButton={false}
      onChange={_.noop}
    />
  );
};

function getPreviewQuery(table: Table, databaseId: number): Lib.Query {
  const metadata = createMockMetadata({
    tables: table ? [table] : [],
  });
  const metadataProvider = Lib.metadataProvider(databaseId, metadata);

  return Lib.fromLegacyQuery(databaseId, metadataProvider, {
    type: "query",
    database: databaseId,
    query: {
      "source-table": table.id,
    },
  });
}

function getPreviewColumn(
  query: Lib.Query,
  fieldId: number,
): Lib.ColumnMetadata {
  const fieldRef: FieldReference = ["field", fieldId, null];
  const columns = Lib.filterableColumns(query, STAGE_INDEX);
  const [index] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    STAGE_INDEX,
    columns,
    [fieldRef],
  );

  return columns[index];
}

export const FilteringPreview = memo(FilteringPreviewBase);
