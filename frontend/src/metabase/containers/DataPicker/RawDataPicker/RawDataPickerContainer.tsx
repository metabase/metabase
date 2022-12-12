import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";

import type Database from "metabase-lib/metadata/Database";
import type Table from "metabase-lib/metadata/Table";

import { DataPickerProps, DataPickerSelectedItem } from "../types";

import useSelectedTables from "../useSelectedTables";

import RawDataPickerView from "./RawDataPickerView";

interface DatabaseListLoaderProps {
  databases: Database[];
}

interface TableListLoaderProps {
  tables: Table[];
}

interface RawDataPickerOwnProps extends DataPickerProps {
  onBack?: () => void;
}

type RawDataPickerProps = RawDataPickerOwnProps & DatabaseListLoaderProps;

function RawDataPicker({
  value,
  databases,
  onChange,
  onBack,
}: RawDataPickerProps) {
  const { databaseId: selectedDatabaseId, schemaId: selectedSchemaId } = value;

  const { selectedTableIds, toggleTableIdSelection } = useSelectedTables({
    initialValues: value.tableIds,
    mode: "multiple",
  });

  const selectedDatabase = useMemo(() => {
    if (!selectedDatabaseId) {
      return;
    }
    return databases.find(db => db.id === selectedDatabaseId);
  }, [databases, selectedDatabaseId]);

  const selectedSchema = useMemo(() => {
    if (!selectedDatabase) {
      return;
    }
    const schemas = selectedDatabase.getSchemas();
    return schemas.find(schema => schema.id === selectedSchemaId);
  }, [selectedDatabase, selectedSchemaId]);

  const selectedItems = useMemo(() => {
    const items: DataPickerSelectedItem[] = [];

    if (selectedDatabaseId) {
      items.push({ type: "database", id: selectedDatabaseId });
    }

    if (selectedSchemaId) {
      items.push({ type: "schema", id: selectedSchemaId });
    }

    const tables: DataPickerSelectedItem[] = selectedTableIds.map(id => ({
      type: "table",
      id,
    }));

    items.push(...tables);

    return items;
  }, [selectedDatabaseId, selectedSchemaId, selectedTableIds]);

  const handleSelectedSchemaIdChange = useCallback(
    (schemaId?: string) => {
      onChange({ ...value, schemaId, tableIds: [] });
    },
    [value, onChange],
  );

  const handleSelectedDatabaseIdChange = useCallback(
    (databaseId: Database["id"]) => {
      const database = databases.find(db => db.id === databaseId);
      if (!database) {
        return;
      }
      let nextSchemaId = undefined;
      const schemas = database.getSchemas() ?? [];
      const hasSchemasLoaded = schemas.length > 0;
      if (hasSchemasLoaded) {
        const hasSingleSchema = schemas.length === 1;
        nextSchemaId = hasSingleSchema ? schemas[0].id : undefined;
      }
      onChange({ ...value, databaseId, schemaId: nextSchemaId, tableIds: [] });
    },
    [value, databases, onChange],
  );

  const handleSelectedTablesChange = useCallback(
    (tableId: Table["id"]) => {
      const tableIds = toggleTableIdSelection(tableId);
      onChange({ ...value, tableIds });
    },
    [value, toggleTableIdSelection, onChange],
  );

  const onDatabaseSchemasLoaded = useCallback(() => {
    if (!selectedSchemaId) {
      const schemas = selectedDatabase?.getSchemas() ?? [];
      const hasSingleSchema = schemas.length === 1;
      if (hasSingleSchema) {
        const [schema] = schemas;
        handleSelectedSchemaIdChange(schema.id);
      }
    }
  }, [selectedDatabase, selectedSchemaId, handleSelectedSchemaIdChange]);

  const renderPicker = useCallback(
    ({ tables }: { tables?: Table[] } = {}) => {
      return (
        <RawDataPickerView
          databases={databases}
          tables={tables}
          selectedItems={selectedItems}
          onSelectDatabase={handleSelectedDatabaseIdChange}
          onSelectSchema={handleSelectedSchemaIdChange}
          onSelectedTable={handleSelectedTablesChange}
          onBack={onBack}
        />
      );
    },
    [
      databases,
      selectedItems,
      handleSelectedDatabaseIdChange,
      handleSelectedSchemaIdChange,
      handleSelectedTablesChange,
      onBack,
    ],
  );

  if (selectedDatabaseId) {
    return (
      <Schemas.ListLoader
        query={{ dbId: selectedDatabaseId }}
        loadingAndErrorWrapper={false}
        onLoaded={onDatabaseSchemasLoaded}
      >
        {() => {
          if (!selectedSchema) {
            return renderPicker();
          }
          return (
            <Tables.ListLoader
              query={{
                dbId: selectedDatabaseId,
                schemaName: selectedSchema.name,
              }}
              loadingAndErrorWrapper={false}
            >
              {({ tables }: TableListLoaderProps) => renderPicker({ tables })}
            </Tables.ListLoader>
          );
        }}
      </Schemas.ListLoader>
    );
  }

  return renderPicker();
}

export default Databases.loadList({ loadingAndErrorWrapper: false })(
  RawDataPicker,
);
