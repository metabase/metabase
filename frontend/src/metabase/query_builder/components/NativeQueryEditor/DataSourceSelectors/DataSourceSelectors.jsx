import cx from "classnames";
import PropTypes from "prop-types";
import { useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { getNativeQueryLanguage } from "metabase/lib/engine";
import {
  DatabaseDataSelector,
  SchemaAndTableDataSelector,
} from "metabase/query_builder/components/DataSelector";

const DataSourceSelectorsPropTypes = {
  isNativeEditorOpen: PropTypes.bool,
  query: PropTypes.object,
  question: PropTypes.object,
  readOnly: PropTypes.bool,
  setDatabaseId: PropTypes.func,
  setTableId: PropTypes.func,
  editorContext: PropTypes.oneOf(["action", "question"]),
};

const PopulatedDataSourceSelectorsPropTypes = {
  database: PropTypes.object,
  databases: PropTypes.array,
  isNativeEditorOpen: PropTypes.bool.isRequired,
  query: PropTypes.object,
  readOnly: PropTypes.bool,
  setDatabaseId: PropTypes.func,
  setTableId: PropTypes.func,
};

const DatabaseSelectorPropTypes = {
  database: PropTypes.object,
  databases: PropTypes.array,
  readOnly: PropTypes.bool,
  setDatabaseId: PropTypes.func,
};

const SingleDatabaseNamePropTypes = {
  database: PropTypes.object,
};

const TableSelectorPropTypes = {
  database: PropTypes.object,
  readOnly: PropTypes.bool,
  selectedTable: PropTypes.object,
  setTableId: PropTypes.func,
};

const PlaceholderPropTypes = {
  query: PropTypes.object,
  editorContext: PropTypes.oneOf(["action", "question"]),
};

const DataSourceSelectors = ({
  isNativeEditorOpen,
  query,
  question,
  readOnly,
  setDatabaseId,
  setTableId,
  editorContext,
}) => {
  const database = question.database();

  const databases = useMemo(() => {
    const allDatabases = query
      .metadata()
      .databasesList({ savedQuestions: false })
      .filter(db => db.canWrite());

    if (editorContext === "action") {
      return allDatabases.filter(database => database.hasActionsEnabled());
    }

    return allDatabases;
  }, [query, editorContext]);

  if (
    !isNativeEditorOpen ||
    databases.length === 0 ||
    (!database && readOnly)
  ) {
    return <Placeholder query={query} editorContext={editorContext} />;
  }

  return (
    <PopulatedDataSourceSelectors
      isNativeEditorOpen={isNativeEditorOpen}
      database={database}
      databases={databases}
      query={query}
      readOnly={readOnly}
      setDatabaseId={setDatabaseId}
      setTableId={setTableId}
    />
  );
};

DataSourceSelectors.propTypes = DataSourceSelectorsPropTypes;

const PopulatedDataSourceSelectors = ({
  database,
  databases,
  query,
  readOnly,
  setDatabaseId,
  setTableId,
}) => {
  const dataSourceSelectors = [];

  const areThereMultipleDatabases = checkIfThereAreMultipleDatabases(
    database,
    databases,
  );

  if (areThereMultipleDatabases) {
    dataSourceSelectors.push(
      <DatabaseSelector
        database={database}
        databases={databases}
        key="db_selector"
        readOnly={readOnly}
        setDatabaseId={setDatabaseId}
      />,
    );
  } else if (database) {
    dataSourceSelectors.push(
      <SingleDatabaseName key="db" database={database} />,
    );
  }

  if (query.requiresTable()) {
    dataSourceSelectors.push(
      <TableSelector
        database={database}
        key="table_selector"
        readOnly={readOnly}
        selectedTable={query.table()}
        setTableId={setTableId}
      />,
    );
  }

  return dataSourceSelectors;
};

PopulatedDataSourceSelectors.propTypes = PopulatedDataSourceSelectorsPropTypes;

const checkIfThereAreMultipleDatabases = (database, databases) =>
  database == null ||
  (databases.length > 1 && databases.some(db => db.id === database.id));

const DatabaseSelector = ({ database, databases, readOnly, setDatabaseId }) => (
  <div
    className={cx(
      QueryBuilderS.GuiBuilderSection,
      QueryBuilderS.GuiBuilderData,
      CS.flex,
      CS.alignCenter,
      CS.ml2,
    )}
    data-testid="gui-builder-data"
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

DatabaseSelector.propTypes = DatabaseSelectorPropTypes;

const SingleDatabaseName = ({ database }) => (
  <div className={cx(CS.p2, CS.textBold)} data-testid="selected-database">
    {database.name}
  </div>
);

SingleDatabaseName.propTypes = SingleDatabaseNamePropTypes;

const TableSelector = ({ database, readOnly, selectedTable, setTableId }) => (
  <div
    className={cx(
      QueryBuilderS.GuiBuilderSection,
      QueryBuilderS.GuiBuilderData,
      CS.flex,
      CS.alignCenter,
      CS.ml2,
    )}
    data-testid="gui-builder-data"
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

TableSelector.propTypes = TableSelectorPropTypes;

const Placeholder = ({ query, editorContext }) => {
  if (editorContext === "action") {
    return null;
  }

  const language = getNativeQueryLanguage(query.engine());
  return (
    <div className={cx(CS.ml2, CS.p2, CS.textMedium)}>
      {t`This question is written in ${language}.`}
    </div>
  );
};

Placeholder.propTypes = PlaceholderPropTypes;

export default DataSourceSelectors;
