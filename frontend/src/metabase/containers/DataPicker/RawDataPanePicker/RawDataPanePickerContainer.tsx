import React, { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";

import type Database from "metabase-lib/lib/metadata/Database";
import type Table from "metabase-lib/lib/metadata/Table";

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

function RawDataPanePicker({ databases }: DatabaseListLoaderProps) {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<
    Database["id"] | undefined
  >();

  const [selectedSchemaId, handleSelectedSchemaIdChange] = useState<
    string | undefined
  >();

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
    return items;
  }, [selectedDatabaseId, selectedSchemaId]);

  const handleSelectedDatabaseIdChange = useCallback((id: Database["id"]) => {
    handleSelectedSchemaIdChange(undefined);
    setSelectedDatabaseId(id);
  }, []);

  const renderPicker = useCallback(
    ({ tables }: { tables?: Table[] } = {}) => {
      return (
        <RawDataPanePickerView
          databases={databases}
          tables={tables}
          selectedItems={selectedItems}
          onSelectDatabase={handleSelectedDatabaseIdChange}
          onSelectSchema={handleSelectedSchemaIdChange}
          onSelectedTable={_.noop}
        />
      );
    },
    [databases, selectedItems, handleSelectedDatabaseIdChange],
  );

  if (selectedDatabaseId) {
    return (
      <Schemas.ListLoader
        query={{ dbId: selectedDatabaseId }}
        loadingAndErrorWrapper={false}
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
