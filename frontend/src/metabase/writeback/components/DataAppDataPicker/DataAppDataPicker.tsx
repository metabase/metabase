import React from "react";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId | null;
  onTableChange: (tableId: TableId | null) => void;
}

function DataAppDataPicker({ tableId, onTableChange }: Props) {
  return (
    <DatabaseSchemaAndTableDataSelector
      selectedTableId={tableId}
      setSourceTableFn={onTableChange}
      requireWriteback
      isPopover={false}
    />
  );
}

export default DataAppDataPicker;
