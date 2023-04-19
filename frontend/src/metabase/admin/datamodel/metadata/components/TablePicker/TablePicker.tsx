import React from "react";
import Schemas from "metabase/entities/schemas";
import { DatabaseId, Schema, TableId } from "metabase-types/api";
import { State } from "metabase-types/store";
import SchemaList from "../SchemaList";
import TableList from "../TableList";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaName?: string;
  selectedTableId?: TableId;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

type TablePickerProps = OwnProps & SchemaLoaderProps;

const TablePicker = ({
  schemas,
  selectedDatabaseId,
  selectedSchemaName,
  selectedTableId,
}: TablePickerProps) => {
  if (selectedSchemaName) {
    return (
      <TableList
        selectedDatabaseId={selectedDatabaseId}
        selectedSchemaName={selectedSchemaName}
        selectedTableId={selectedTableId}
        canGoBack={schemas.length > 1}
      />
    );
  } else {
    return (
      <SchemaList
        selectedDatabaseId={selectedDatabaseId}
        selectedSchemaName={selectedSchemaName}
      />
    );
  }
};

export default Schemas.loadList({
  query: (_: State, { selectedDatabaseId }: OwnProps) => ({
    dbId: selectedDatabaseId,
  }),
})(TablePicker);
