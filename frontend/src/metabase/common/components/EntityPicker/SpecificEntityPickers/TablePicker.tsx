import { useState, useEffect } from "react";

import type { Table, SearchResult, Database, Schema } from "metabase-types/api";
import { databases, schemas, tables } from "metabase/entities";

import { NestedItemPicker } from "../components";
import type { PickerState } from "../types";

interface TablePickerProps {
  onItemSelect: (item: SearchResult) => void;
  initialTableId?: number;
  options?: any;
}

export function TablePicker({
  onItemSelect,
  initialTableId,
}: TablePickerProps) {
  const [initialState, setInitialState] = useState<PickerState<SearchResult>>();

  // need better generics for this to work properly
  const onFolderSelect = async (item: any /* Database | Schema */): Promise<(SearchResult | Database | Schema | Table)[]> => {
    // need type guards here
    if (item.model === "database" && item.features.includes("schemas")) {
      return schemas.api
        .list({ dbId: item.id })
        .then((data: Table[])=> data.map(d => ({ ...d, model: "schema" })));
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
              .then(({ data }: { data: Database[] }) => data.map(d => ({ ...d, model: "database" }))),
            selectedId: table.db_id,
          },
          {
            items: await schemas.api
              .list({ dbId: table.db_id })
              .then(( data: Schema[] ) => data.map(d => ({ ...d, model: "schema" }))),
            selectedId: `${table.db_id}:${table.schema}`,
          },
          {
            items: await tables.api
              .list({
                dbId: table.db_id,
                schemaName: table.schema,
              })
              .then((data: Table[] )=> data.map(d => ({ ...d, model: "table" }))),
            selectedId: null,
          },
        ];

        setInitialState(state as any);
      });
    } else {
      databases.api.list().then(({ data }: { data: Database[] }) => {
        setInitialState([
          {
            items: data.map(d => ({ ...d, model: "database" })),
            selectedItem: null,
          },
        ]);
      });
    }
  }, [initialTableId]);

  if (!initialState) {
    return null;
  }

  return (
    <NestedItemPicker
      itemModel="table"
      folderModel="database | schema"
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      initialState={initialState}
    />
  );
}
