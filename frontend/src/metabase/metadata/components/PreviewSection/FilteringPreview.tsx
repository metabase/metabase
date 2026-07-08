import { memo, useMemo } from "react";
import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import * as Lib from "metabase-lib";
import type {
  DatabaseId,
  Field,
  FieldId,
  FieldReference,
  Table,
} from "metabase-types/api";

import { HiddenFieldEmptyStateBlock } from "./EmptyStateBlock";
import { isFieldHidden } from "./utils";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  table: Table;
}

const STAGE_INDEX = 0;

const FilteringPreviewBase = ({ databaseId, field, fieldId, table }: Props) => {
  const query = useMemo(
    () => getPreviewQuery(table, databaseId),
    [databaseId, table],
  );
  const column = useMemo(
    () => query && getPreviewColumn(query, fieldId),
    [fieldId, query],
  );

  if (isFieldHidden(field)) {
    return <HiddenFieldEmptyStateBlock />;
  }

  if (query == null || column == null) {
    return null;
  }

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

function getPreviewQuery(
  table: Table,
  databaseId: number,
): Lib.Query | undefined {
  const metadata = createMockMetadata({
    tables: table
      ? [
          {
            ...table,
            // When table is hidden metabase-lib will give an empty list of columns for it.
            // We need to pretend it is visible so that FilterPickerBody can know about it.
            visibility_type: null,
          },
        ]
      : [],
  });
  const metadataProvider = Lib.metadataProvider(databaseId, metadata);
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
  if (tableMetadata == null) {
    return undefined;
  }
  return Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);
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
