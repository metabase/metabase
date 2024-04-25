import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { useMount } from "react-use";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import Search from "metabase/entities/search";
import { getHasDataAccess } from "metabase/selectors/data";
import { getSetting } from "metabase/selectors/settings";
import type Database from "metabase-lib/v1/metadata/Database";
import {
  getRootCollectionVirtualSchemaId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { DataPickerContextProvider, useDataPicker } from "./DataPickerContext";
import DataPickerView from "./DataPickerView";
import { DEFAULT_DATA_PICKER_FILTERS } from "./constants";
import type {
  DataPickerProps as DataPickerOwnProps,
  DataPickerDataType,
} from "./types";
import { getDataTypes } from "./utils";

interface DataPickerStateProps {
  hasNestedQueriesEnabled: boolean;
  hasDataAccess: boolean;
}

interface DatabaseListLoaderProps {
  databases: Database[];
}

interface SearchListLoaderProps {
  search: unknown[];
}

type DataPickerProps = DataPickerOwnProps &
  DataPickerStateProps &
  DatabaseListLoaderProps &
  SearchListLoaderProps;

function mapStateToProps(state: State, { databases }: DatabaseListLoaderProps) {
  return {
    hasNestedQueriesEnabled: getSetting(state, "enable-nested-queries"),
    hasDataAccess: getHasDataAccess(databases),
  };
}

function DataPicker({
  value,
  databases: allDatabases,
  search: modelLookupResult,
  filters: customFilters = {},
  hasNestedQueriesEnabled,
  hasDataAccess,
  ...props
}: DataPickerProps) {
  const { onChange } = props;

  const { search } = useDataPicker();

  const filters = useMemo(
    () => ({
      ...DEFAULT_DATA_PICKER_FILTERS,
      ...customFilters,
    }),
    [customFilters],
  );

  const databases = useMemo(
    () => allDatabases.filter(database => !database.is_saved_questions),
    [allDatabases],
  );

  const dataTypes = useMemo(
    () =>
      getDataTypes({
        hasModels: modelLookupResult.length > 0,
        hasSavedQuestions: allDatabases.some(
          database => database.is_saved_questions,
        ),
        hasNestedQueriesEnabled,
      }).filter(type => filters.types(type.id)),
    [allDatabases, filters, modelLookupResult, hasNestedQueriesEnabled],
  );

  const handleDataTypeChange = useCallback(
    (type: DataPickerDataType) => {
      const isModels = type === "models";
      const isUsingVirtualTables = isModels || type === "questions";

      let databaseId: DatabaseId | undefined = undefined;

      if (isUsingVirtualTables) {
        // When switching to models or questions,
        // we want to automatically open Our analytics collection
        databaseId = SAVED_QUESTIONS_VIRTUAL_DB_ID;
      } else if (databases.length === 1) {
        databaseId = databases[0].id;
      }

      const schemaId = isUsingVirtualTables
        ? getRootCollectionVirtualSchemaId({ isModels })
        : undefined;
      const collectionId = isUsingVirtualTables ? "root" : undefined;

      onChange({
        type,
        databaseId,
        schemaId,
        collectionId,
        tableIds: [],
      });
    },
    [databases, onChange],
  );

  useMount(() => {
    if (dataTypes.length === 1 && value.type !== dataTypes[0].id) {
      handleDataTypeChange(dataTypes[0].id);
    }
  });

  const handleReset = useCallback(() => {
    onChange({
      type: undefined,
      databaseId: undefined,
      schemaId: undefined,
      tableIds: [],
    });
  }, [onChange]);

  const canGoBack = dataTypes.length > 1;

  return (
    <DataPickerView
      {...props}
      value={value}
      dataTypes={dataTypes}
      searchQuery={search.query}
      hasDataAccess={hasDataAccess}
      onDataTypeChange={handleDataTypeChange}
      onBack={canGoBack ? handleReset : undefined}
    />
  );
}

const DataPickerContainer = _.compose(
  // Required for `hasDataAccess` check
  Databases.loadList({
    query: { saved: true },
  }),

  // Lets the picker check there is
  // at least one model, to offer for selection
  Search.loadList({
    query: {
      models: ["dataset"],
      limit: 1,
    },
  }),

  connect(mapStateToProps),
)(DataPicker);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(DataPickerContainer, {
  Provider: DataPickerContextProvider,
});
