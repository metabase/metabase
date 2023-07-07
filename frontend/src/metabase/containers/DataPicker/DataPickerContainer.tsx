import { useCallback, useMemo } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { getHasDataAccess } from "metabase/selectors/data";
import { getSetting } from "metabase/selectors/settings";

import Databases from "metabase/entities/databases";
import Search from "metabase/entities/search";
import { useSelector } from "metabase/lib/redux";

import type { DatabaseId } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";

import {
  getRootCollectionVirtualSchemaId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";

import type {
  DataPickerDataType,
  DataPickerProps as DataPickerOwnProps,
} from "./types";

import { DataPickerContextProvider, useDataPicker } from "./DataPickerContext";
import { DEFAULT_DATA_PICKER_FILTERS, getDataTypes } from "./utils";

import DataPickerView from "./DataPickerView";

interface DataPickerStateProps {
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

function DataPicker({
  value,
  databases: allDatabases,
  search: modelLookupResult,
  filters: customFilters,
  ...props
}: DataPickerProps) {
  const hasDataAccess = getHasDataAccess(allDatabases);
  const { onChange } = props;

  const { search } = useDataPicker();

  const databases = useMemo(
    () => allDatabases.filter(database => !database.is_saved_questions),
    [allDatabases],
  );
  const filters = useMemo(
    () => ({ ...DEFAULT_DATA_PICKER_FILTERS, ...customFilters }),
    [customFilters],
  );
  const hasModels = modelLookupResult.length > 0;
  const hasSavedQuestions = allDatabases.length > databases.length;
  const hasNestedQueriesEnabled = useSelector(state =>
    getSetting(state, "enable-nested-queries"),
  );

  const dataTypes = useMemo(() => {
    return getDataTypes({
      hasModels,
      hasSavedQuestions,
      hasNestedQueriesEnabled,
    }).filter(type => filters.types(type.id));
  }, [filters, hasModels, hasNestedQueriesEnabled, hasSavedQuestions]);

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
      models: "dataset",
      limit: 1,
    },
  }),
)(DataPicker);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(DataPickerContainer, {
  Provider: DataPickerContextProvider,
});
