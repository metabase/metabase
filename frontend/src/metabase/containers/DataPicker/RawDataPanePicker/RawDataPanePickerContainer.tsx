import React, { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";

import type Database from "metabase-lib/lib/metadata/Database";
import type Table from "metabase-lib/lib/metadata/Table";

import useSelectedTables from "./useSelectedTables";
import RawDataPanePickerView from "./RawDataPanePickerView";

interface DatabaseListLoaderProps {
  databases: Database[];
}

interface TableListLoaderProps {
  tables: Table[];
}

type RawDataPickerSelectedItem = {
  type: "database" | "schema" | "table";
  id: string | number;
};

interface RawDataPanePickerOwnProps {
  onTablesChange?: (tableIds: Table["id"][]) => void;
}

type Props = RawDataPanePickerOwnProps & DatabaseListLoaderProps;

function RawDataPanePicker({ databases, onTablesChange }: Props) {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<
    Database["id"] | undefined
  >();

  const [selectedSchemaId, setSelectedSchemaId] = useState<
    string | undefined
  >();

  const { selectedTableIds, toggleTableIdSelection, clearSelectedTables } =
    useSelectedTables({ mode: "multiple" });

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
    const items: RawDataPickerSelectedItem[] = [];

    if (selectedDatabaseId) {
      items.push({ type: "database", id: selectedDatabaseId });
    }

    if (selectedSchemaId) {
      items.push({ type: "schema", id: selectedSchemaId });
    }

    const tables: RawDataPickerSelectedItem[] = selectedTableIds.map(id => ({
      type: "table",
      id,
    }));

    items.push(...tables);

    return items;
  }, [selectedDatabaseId, selectedSchemaId, selectedTableIds]);

  const handleSelectedSchemaIdChange = useCallback(
    (id?: string) => {
      clearSelectedTables();
      setSelectedSchemaId(id);
    },
    [clearSelectedTables],
  );

  const handleSelectedDatabaseIdChange = useCallback(
    (id: Database["id"]) => {
      const database = databases.find(db => db.id === id);
      if (!database) {
        return;
      }
      const schemas = database.getSchemas() ?? [];
      const hasSchemasLoaded = schemas.length > 0;
      if (hasSchemasLoaded) {
        const hasSingleSchema = schemas.length === 1;
        const nextSchemaId = hasSingleSchema ? schemas[0].id : undefined;
        handleSelectedSchemaIdChange(nextSchemaId);
      } else {
        handleSelectedSchemaIdChange(undefined);
      }
      setSelectedDatabaseId(id);
    },
    [databases, handleSelectedSchemaIdChange],
  );

  const handleSelectedTablesChange = useCallback(
    (tableId: Table["id"]) => {
      const tableIds = toggleTableIdSelection(tableId);
      onTablesChange?.(tableIds);
    },
    [toggleTableIdSelection, onTablesChange],
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
        <RawDataPanePickerView
          databases={databases}
          tables={tables}
          selectedItems={selectedItems}
          onSelectDatabase={handleSelectedDatabaseIdChange}
          onSelectSchema={handleSelectedSchemaIdChange}
          onSelectedTable={handleSelectedTablesChange}
        />
      );
    },
    [
      databases,
      selectedItems,
      handleSelectedDatabaseIdChange,
      handleSelectedSchemaIdChange,
      handleSelectedTablesChange,
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
  RawDataPanePicker,
);
