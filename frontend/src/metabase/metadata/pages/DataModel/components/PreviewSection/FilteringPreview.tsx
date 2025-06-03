import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import {
  useGetDatabaseQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import * as Lib from "metabase-lib";
import type { DatabaseId, Field, FieldId, TableId } from "metabase-types/api";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  tableId: TableId;
}

export function FilteringPreview({
  databaseId,
  field,
  fieldId,
  tableId,
}: Props) {
  const { data: database } = useGetDatabaseQuery({ id: databaseId }); // TODO plugins
  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId }); // TODO plugins
  const metadataProvider = Lib.metadataProvider(
    databaseId,
    createMockMetadata({
      databases: database ? [database] : [],
      fields: field ? [field] : [],
      tables: table ? [table] : [],
    }),
  );

  const query = Lib.fromLegacyQuery(databaseId, metadataProvider, {
    type: "query",
    database: databaseId,
    query: {
      "source-table": tableId,
    },
  });
  const stageIndex = 0;
  const column = Lib.fromLegacyColumn(query, stageIndex, field);

  // const column = Lib.legacyColumnTypeInfo(field);

  return (
    <FilterPickerBody
      column={column}
      query={query}
      stageIndex={stageIndex}
      onChange={_.noop}
    />
  );
}
