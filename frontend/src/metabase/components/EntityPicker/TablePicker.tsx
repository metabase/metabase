import { useState, useEffect } from "react";

import type { Table } from "metabase-types/api";
import { databases, schemas, tables } from "metabase/entities";
import type Question from "metabase-lib/Question";

import { EntityPicker } from "./EntityPicker";

interface TablePickerProps {
  onItemSelect: (item: Question) => void;
  initialTableId?: number;
}

export function TablePicker({
  onItemSelect,
  initialTableId,
}: TablePickerProps) {
  const [initialState, setInitialState] = useState<any>();

  const onFolderSelect = async (item: any) => {
    if (item.model === "database" && item.features.includes("schemas")) {
      return schemas.api
        .list({ dbId: item.id })
        .then(data => data.map(d => ({ ...d, model: "schema" })));
    } else {
      return tables.api.list({
        dbId: item.model === "database" ? item.id : item.database.id,
        schemaName: item.model === "database" ? "" : item.name,
      });
    }
  };

  useEffect(() => {
    if (initialTableId) {
      tables.api.get({ id: initialTableId }).then(async (table: Table) => {
        const state = [
          {
            items: await databases.api
              .list()
              .then(({ data }) => data.map(d => ({ ...d, model: "database" }))),
            selectedId: table.db_id,
          },
          {
            items: await schemas.api
              .list({ dbId: table.db_id })
              .then(data => data.map(d => ({ ...d, model: "schema" }))),
            selectedId: `${table.db_id}:${table.schema}`,
          },
          {
            items: await tables.api
              .list({
                dbId: table.db_id,
                schemaName: table.schema,
              })
              .then(data => data.map(d => ({ ...d, model: "table" }))),
            selectedId: null,
          },
        ];

        setInitialState(state);
      });
    } else {
      databases.api.list().then(({ data }) => {
        setInitialState([
          {
            items: data.map(d => ({ ...d, model: "database" })),
            selectedId: "",
          },
        ]);
      });
    }
  }, [initialTableId]);

  if (!initialState) {
    return null;
  }

  return (
    <EntityPicker
      itemModel="table"
      folderModel="database | schema"
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      initialState={initialState}
    />
  );
}
