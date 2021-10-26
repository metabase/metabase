import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import {
  DatabaseDataSelector,
  SchemaAndTableDataSelector,
} from "metabase/query_builder/components/DataSelector";

const DataSelectorPropTypes = {
  database: PropTypes.object,
  databases: PropTypes.array,
  readOnly: PropTypes.bool,
  setDatabaseId: PropTypes.func,
};

const SelectorWithDatabaseNamePropTypes = {
  database: PropTypes.object,
};

const SelectorWithTablePropTypes = {
  database: PropTypes.object,
  readOnly: PropTypes.bool,
  selectedTable: PropTypes.object,
  setTableId: PropTypes.func,
};

const PlaceholderPropTypes = {
  query: PropTypes.object,
};

const DataSelectors = ({
  isNativeEditorOpen,
  query,
  readOnly,
  setDatabaseId,
  setTableId,
}) => {
  const database = query.database();
  const databases = query.metadata().databasesList({ savedQuestions: false });

  const areThereMultipleDatabases = checkIfThereAreMultipleDatabases(
    database,
    databases,
  );

  if (!isNativeEditorOpen || databases.length === 0) {
    return <Placeholder query={query} />;
  }

  const dataSelectors = [];

  if (areThereMultipleDatabases) {
    dataSelectors.push(
      <DataSelector
        database={database}
        databases={databases}
        readOnly={readOnly}
        setDatabaseId={setDatabaseId}
      />,
    );
  } else if (database) {
    dataSelectors.push(<SelectorWithDatabaseName database={database} />);
  }

  if (query.requiresTable()) {
    dataSelectors.push(
      <SelectorWithTable
        database={database}
        readOnly={readOnly}
        selectedTable={query.table()}
        setTableId={setTableId}
      />,
    );
  }

  return dataSelectors;
};

const checkIfThereAreMultipleDatabases = (database, databases) =>
  database == null ||
  (databases.length > 1 && databases.some(db => db.id === database.id));

const DataSelector = ({ database, databases, readOnly, setDatabaseId }) => (
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
  </div>
);

DataSelector.propTypes = DataSelectorPropTypes;

const SelectorWithDatabaseName = ({ database }) => (
  <span key="db" className="p2 text-bold text-grey">
    {database.name}
  </span>
);

SelectorWithDatabaseName.propTypes = SelectorWithDatabaseNamePropTypes;

const SelectorWithTable = ({
  database,
  readOnly,
  selectedTable,
  setTableId,
}) => (
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
  </div>
);

SelectorWithTable.propTypes = SelectorWithTablePropTypes;

const Placeholder = ({ query }) => (
  <span className="ml2 p2 text-medium">
    {t`This question is written in ${query.nativeQueryLanguage()}.`}
  </span>
);

Placeholder.propTypes = PlaceholderPropTypes;

export default DataSelectors;
