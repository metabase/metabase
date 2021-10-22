import React from "react";
import { t } from "ttag";

import {
  DatabaseDataSelector,
  SchemaAndTableDataSelector,
} from "metabase/query_builder/components/DataSelector";

export const getDataSelectors = ({
  isNativeEditorOpen,
  query,
  readOnly,
  setDatabaseId,
  setTableId,
}) => {
  const database = query.database();
  const databases = query.metadata().databasesList({ savedQuestions: false });

  const dataSelectors = [];
  if (isNativeEditorOpen && databases.length > 0) {
    // we only render a db selector if there are actually multiple to choose from
    if (
      database == null ||
      (databases.length > 1 && databases.some(db => db.id === database.id))
    ) {
      dataSelectors.push(
        <div
          key="db_selector"
          className="GuiBuilder-section GuiBuilder-data flex align-center ml2"
        >
          <DatabaseDataSelector
            databases={databases}
            selectedDatabaseId={database?.id}
            setDatabaseFn={setDatabaseId}
            isInitiallyOpen={database == null}
            readOnly={readOnly}
          />
        </div>,
      );
    } else if (database) {
      dataSelectors.push(
        <span key="db" className="p2 text-bold text-grey">
          {database.name}
        </span>,
      );
    }

    if (query.requiresTable()) {
      const selectedTable = query.table();
      dataSelectors.push(
        <div
          key="table_selector"
          className="GuiBuilder-section GuiBuilder-data flex align-center ml2"
        >
          <SchemaAndTableDataSelector
            selectedTableId={selectedTable?.id || null}
            selectedDatabaseId={database?.id}
            databases={[database]}
            setSourceTableFn={setTableId}
            isInitiallyOpen={false}
            readOnly={readOnly}
          />
        </div>,
      );
    }

    return dataSelectors;
  } else {
    return placeholder(query);
  }
};

const placeholder = query => (
  <span className="ml2 p2 text-medium">
    {t`This question is written in ${query.nativeQueryLanguage()}.`}
  </span>
);
