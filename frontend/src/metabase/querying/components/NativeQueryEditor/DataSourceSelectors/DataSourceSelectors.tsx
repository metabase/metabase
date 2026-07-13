import cx from "classnames";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { getNativeQueryLanguage } from "metabase/databases/utils/engine";
import {
  DatabaseDataSelector,
  SchemaAndTableDataSelector,
} from "metabase/querying/common/components/DataSelector";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { DatabaseId, TableId } from "metabase-types/api";

type EditorContext = "action" | "question";

interface DataSourceSelectorsProps {
  isNativeEditorOpen: boolean;
  query: NativeQuery;
  question: Question;
  readOnly?: boolean;
  setDatabaseId: (databaseId: DatabaseId) => void;
  setTableId: (tableId: TableId) => void;
  editorContext?: EditorContext;
  databaseIsDisabled?: (database: Database) => boolean;
  databaseDisabledTooltip?: (database: Database) => string | undefined;
}

export const DataSourceSelectors = ({
  isNativeEditorOpen,
  query,
  question,
  readOnly,
  setDatabaseId,
  setTableId,
  editorContext,
  databaseIsDisabled,
  databaseDisabledTooltip,
}: DataSourceSelectorsProps) => {
  const database = question.database();

  const databases = useMemo(() => {
    const allDatabases = query
      .metadata()
      .databasesList({ savedQuestions: false })
      .filter((db) => db.canWrite() && !db.is_audit);

    if (editorContext === "action") {
      return allDatabases.filter((database) => database.hasActionsEnabled());
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
      databaseIsDisabled={databaseIsDisabled}
      databaseDisabledTooltip={databaseDisabledTooltip}
    />
  );
};

interface PopulatedDataSourceSelectorsProps {
  database: Database | null;
  databases: Database[];
  isNativeEditorOpen: boolean;
  query: NativeQuery;
  readOnly?: boolean;
  setDatabaseId: (databaseId: DatabaseId) => void;
  setTableId: (tableId: TableId) => void;
  databaseIsDisabled?: (database: Database) => boolean;
  databaseDisabledTooltip?: (database: Database) => string | undefined;
}

const PopulatedDataSourceSelectors = ({
  database,
  databases,
  query,
  readOnly,
  setDatabaseId,
  setTableId,
  databaseIsDisabled,
  databaseDisabledTooltip,
}: PopulatedDataSourceSelectorsProps) => {
  const dataSourceSelectors: ReactNode[] = [];

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
        databaseIsDisabled={databaseIsDisabled}
        databaseDisabledTooltip={databaseDisabledTooltip}
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

const checkIfThereAreMultipleDatabases = (
  database: Database | null,
  databases: Database[],
) =>
  database == null ||
  (databases.length > 1 && databases.some((db) => db.id === database.id));

interface DatabaseSelectorProps {
  database: Database | null;
  databases: Database[];
  readOnly?: boolean;
  setDatabaseId: (databaseId: DatabaseId) => void;
  databaseIsDisabled?: (database: Database) => boolean;
  databaseDisabledTooltip?: (database: Database) => string | undefined;
}

const DatabaseSelector = ({
  database,
  databases,
  readOnly,
  setDatabaseId,
  databaseIsDisabled,
  databaseDisabledTooltip,
}: DatabaseSelectorProps) => (
  <div
    className={cx(
      QueryBuilderS.GuiBuilderSection,
      QueryBuilderS.GuiBuilderData,
      CS.flex,
      CS.alignCenter,
      CS.ml1,
      readOnly && CS.pointerEventsNone,
    )}
    data-testid="gui-builder-data"
  >
    <DatabaseDataSelector
      databases={databases}
      selectedDatabaseId={database?.id}
      setDatabaseFn={setDatabaseId}
      isInitiallyOpen={database == null && databases.length > 1}
      readOnly={readOnly}
      databaseIsDisabled={databaseIsDisabled}
      databaseDisabledTooltip={databaseDisabledTooltip}
    />
  </div>
);

interface SingleDatabaseNameProps {
  database: Database;
}

const SingleDatabaseName = ({ database }: SingleDatabaseNameProps) => (
  <Flex
    h="3rem"
    px="md"
    align="center"
    fw="bold"
    data-testid="selected-database"
  >
    {database.name}
  </Flex>
);

interface TableSelectorProps {
  database: Database | null;
  readOnly?: boolean;
  selectedTable: Table | null;
  setTableId: (tableId: TableId) => void;
}

const TableSelector = ({
  database,
  readOnly,
  selectedTable,
  setTableId,
}: TableSelectorProps) => (
  <div
    className={cx(
      QueryBuilderS.GuiBuilderSection,
      QueryBuilderS.GuiBuilderData,
      CS.flex,
      CS.alignCenter,
      CS.ml1,
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

interface PlaceholderProps {
  query: NativeQuery;
  editorContext?: EditorContext;
}

const Placeholder = ({ query, editorContext }: PlaceholderProps) => {
  if (editorContext === "action") {
    return null;
  }

  const language = getNativeQueryLanguage(query.engine() ?? undefined);
  return (
    <Flex
      align="center"
      h="3rem"
      className={cx(CS.textNoWrap, CS.ml2, CS.px2, CS.textMedium)}
    >
      {t`This question is written in ${language}.`}
    </Flex>
  );
};
