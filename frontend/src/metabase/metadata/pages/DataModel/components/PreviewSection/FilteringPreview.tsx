import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import { useGetTableQueryMetadataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import * as Lib from "metabase-lib";
import type {
  DatabaseId,
  Field,
  FieldId,
  FieldReference,
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
  const { data: table, isFetching: isTableFetching } =
    useGetTableQueryMetadataQuery({ id: tableId }); // TODO plugins

  const metadata = createMockMetadata({
    tables: table ? [table] : [],
  });
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
  const columns = Lib.filterableColumns(query, stageIndex);
  const [index] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [fieldRef],
  );
  const column = columns[index];

  if (isTableFetching || !table) {
    return <LoadingAndErrorWrapper loading={isTableFetching} />;
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
