import _ from "underscore";

import {
  useGetDatabaseMetadataQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  Database,
  DatabaseId,
  Field,
  FieldId,
  FieldReference,
  Table,
  TableId,
} from "metabase-types/api";

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
  const { data: database, isFetching: isDatabaseFetching } =
    useGetDatabaseMetadataQuery({ id: databaseId }); // TODO plugins
  const { data: table, isFetching: isTableFetching } =
    useGetTableQueryMetadataQuery({ id: tableId }); // TODO plugins

  const metadata = useSelector(getMetadata);
  // const metadata = createMockMetadata({
  //   databases: database ? [database] : [],
  //   fields: field ? [field] : [],
  //   tables: table ? [table] : [],
  // });
  // const metadata = createMinimumMetadata(database, table, field);
  const metadataProvider = Lib.metadataProvider(databaseId, metadata);

  const query = Lib.fromLegacyQuery(databaseId, metadataProvider, {
    type: "query",
    database: databaseId,
    query: {
      "source-table": tableId,
    },
  });
  const stageIndex = 0;
  const fieldRef: FieldReference = ["field", fieldId, null];
  const columns = Lib.visibleColumns(query, stageIndex);
  const [index] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [fieldRef],
  );
  const column = columns[index];
  // const column = Lib.legacyColumnTypeInfo(field);

  if (isTableFetching || isDatabaseFetching || !database || !table) {
    return (
      <LoadingAndErrorWrapper loading={isTableFetching || isDatabaseFetching} />
    );
  }

  return (
    <FilterPickerBody
      column={column}
      query={query}
      stageIndex={stageIndex}
      onChange={_.noop}
    />
  );
}

function createMinimumMetadata(
  database: Database,
  table: Table,
  field: Field,
): Metadata {
  const metadata: Metadata = {
    // @ts-expect-error now we know
    databases: { [database.id]: database },
    // @ts-expect-error now we know
    tables: { [table.id]: table },
    // @ts-expect-error we know now
    fields: Object.fromEntries(
      (table.fields ?? []).map((field) => [getRawTableFieldId(field), field]),
    ),
  };

  return metadata;
}
