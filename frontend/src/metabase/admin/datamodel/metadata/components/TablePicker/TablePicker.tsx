import React, { useCallback, useState } from "react";
import Schemas from "metabase/entities/schemas";
import { DatabaseId, Schema, Table } from "metabase-types/api";
import { State } from "metabase-types/store";
import SchemaList from "../SchemaList";
import TableList from "../TableList";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

type TablePickerProps = OwnProps & SchemaLoaderProps;

const TablePicker = ({ selectedDatabaseId, schemas }: TablePickerProps) => {
  const canChangeSchema = schemas.length > 1;
  const initialSchema = canChangeSchema ? undefined : schemas[0];
  const [selectedSchema, setSelectedSchema] = useState(initialSchema);
  const [selectedTable, setSelectedTable] = useState<Table>();

  const handleBack = useCallback(() => {
    setSelectedSchema(undefined);
  }, []);

  if (selectedSchema) {
    return (
      <TableList
        selectedDatabaseId={selectedDatabaseId}
        selectedSchema={selectedSchema}
        selectedTable={selectedTable}
        onSelectTable={setSelectedTable}
        onBack={canChangeSchema ? handleBack : undefined}
      />
    );
  } else {
    return (
      <SchemaList
        selectedDatabaseId={selectedDatabaseId}
        selectedSchema={selectedSchema}
        onSelectSchema={setSelectedSchema}
      />
    );
  }
};

export default Schemas.loadList({
  query: (state: State, { selectedDatabaseId }: OwnProps) => ({
    dbId: selectedDatabaseId,
  }),
})(TablePicker);
