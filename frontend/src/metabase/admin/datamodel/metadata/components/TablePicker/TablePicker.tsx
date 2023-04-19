import React, { useCallback } from "react";
import _ from "underscore";
import { DatabaseId, Schema, Table, TableId } from "metabase-types/api";
import SchemaList from "../SchemaList";
import TableList from "../TableList";

interface TablePickerProps {
  schemas: Schema[];
  tables: Table[];
  selectedDatabaseId: DatabaseId;
  selectedSchemaName?: string;
  selectedTableId?: TableId;
  onSelectDatabase: (databaseId: DatabaseId) => void;
  onSelectSchema: (databaseId: DatabaseId, schemaName: string) => void;
  onSelectTable: (
    databaseId: DatabaseId,
    schemaName: string,
    tableId: TableId,
  ) => void;
}

const TablePicker = ({
  schemas,
  tables,
  selectedDatabaseId,
  selectedSchemaName,
  selectedTableId,
  onSelectDatabase,
  onSelectSchema,
  onSelectTable,
}: TablePickerProps) => {
  const selectedSchema = _.findWhere(schemas, { name: selectedSchemaName });
  const selectedTable = _.findWhere(tables, { id: selectedTableId });
  const canChangeSchema = schemas.length > 1;

  const handleSelectSchema = useCallback(
    (schemaName: string) => {
      onSelectSchema(selectedDatabaseId, schemaName);
    },
    [selectedDatabaseId, onSelectSchema],
  );

  const handleSelectTable = useCallback(
    (tableId: TableId) => {
      if (selectedSchemaName) {
        onSelectTable(selectedDatabaseId, selectedSchemaName, tableId);
      }
    },
    [selectedDatabaseId, selectedSchemaName, onSelectTable],
  );

  const handleBack = useCallback(() => {
    onSelectDatabase(selectedDatabaseId);
  }, [selectedDatabaseId, onSelectDatabase]);

  if (selectedSchema) {
    return (
      <TableList
        tables={tables}
        selectedDatabaseId={selectedDatabaseId}
        selectedSchema={selectedSchema}
        selectedTable={selectedTable}
        onSelectTable={handleSelectTable}
        onBack={canChangeSchema ? handleBack : undefined}
      />
    );
  } else {
    return (
      <SchemaList
        schemas={schemas}
        selectedDatabaseId={selectedDatabaseId}
        selectedSchema={selectedSchema}
        onSelectSchema={handleSelectSchema}
      />
    );
  }
};

export default TablePicker;
