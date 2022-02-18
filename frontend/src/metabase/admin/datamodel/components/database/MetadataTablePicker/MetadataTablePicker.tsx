import React, { useState } from "react";
import _ from "underscore";
import Tables from "metabase/entities/tables";
import { isSyncInProgress } from "metabase/lib/syncing";
import MetadataTableList from "../MetadataTableList";
import MetadataSchemaList from "../MetadataSchemaList";
import { Table } from "metabase-types/types/Table";
import { State } from "metabase-types/store";

interface MetadataTablePickerProps {
  tableId: number;
  databaseId: number;
  tables: Table[];
  selectTable: (table: Table) => void;
}

const MetadataTablePicker = (props: MetadataTablePickerProps) => {
  const { tableId, tables } = props;

  const selectedTable = _.findWhere(tables, { id: tableId });

  const [showTablePicker, setShowTablePicker] = useState(true);
  const [selectedSchema, setSelectedSchema] = useState<string | undefined>(
    selectedTable?.schema_name,
  );

  const tablesBySchemaName = _.groupBy(tables, t => t.schema_name);
  const schemas = Object.keys(tablesBySchemaName).sort((a, b) =>
    a.localeCompare(b),
  );

  const handleSchemaChange = (schema: string) => {
    setSelectedSchema(schema);
    setShowTablePicker(true);
  };

  if (schemas.length === 1) {
    return (
      <MetadataTableList {...props} tables={tablesBySchemaName[schemas[0]]} />
    );
  }

  if (selectedSchema && showTablePicker) {
    return (
      <MetadataTableList
        {...props}
        tables={tablesBySchemaName[selectedSchema]}
        schema={selectedSchema}
        onBack={() => setShowTablePicker(false)}
      />
    );
  }
  return (
    <MetadataSchemaList
      schemas={schemas}
      selectedSchema={selectedSchema}
      onChangeSchema={handleSchemaChange}
    />
  );
};

const RELOAD_INTERVAL = 2000;

export default _.compose(
  Tables.loadList({
    query: (_state: State, { databaseId }: MetadataTablePickerProps) => ({
      dbId: databaseId,
      include_hidden: true,
    }),
    reloadInterval: (
      _state: State,
      _props: MetadataTablePickerProps,
      tables = [],
    ) => {
      return tables.some(t => isSyncInProgress(t)) ? RELOAD_INTERVAL : 0;
    },
    selectorName: "getDataModelTables",
  }),
)(MetadataTablePicker);
