import { useCallback, useMemo } from "react";
import { useMount } from "react-use";

import { getHasDataAccess } from "metabase/selectors/data";
import { getSetting } from "metabase/selectors/settings";

import { useSelector } from "metabase/lib/redux";

import type { DatabaseId } from "metabase-types/api";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import {
  getRootCollectionVirtualSchemaId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";

import type { DataPickerDataType, DataPickerProps } from "./types";

import { DataPickerContextProvider, useDataPicker } from "./DataPickerContext";
import { DEFAULT_DATA_PICKER_FILTERS, getDataTypes } from "./utils";

import DataPickerView from "./DataPickerView";

const useDataPickerConfig = () => {
  const {
    data: allDatabases = [],
    error: databasesError,
    isLoading: areDatabasesLoading,
  } = useDatabaseListQuery({ query: { saved: true } });
  const {
    data: models,
    error: hasModelsError,
    isLoading: isHasModelsLoading,
  } = useSearchListQuery({ query: { models: "dataset", limit: 1 } });

  const databases = useMemo(
    () => allDatabases.filter(database => !database.is_saved_questions),
    [allDatabases],
  );

  const hasModels = models ? models.length > 0 : false;
  const hasSavedQuestions = databases.some(
    database => database.is_saved_questions,
  );
  const hasNestedQueriesEnabled = useSelector(state =>
    getSetting(state, "enable-nested-queries"),
  );

  const dataTypes = useMemo(() => {
    return getDataTypes({
      hasModels,
      hasSavedQuestions,
      hasNestedQueriesEnabled,
    });
  }, [hasModels, hasSavedQuestions, hasNestedQueriesEnabled]);

  return {
    databases: allDatabases,
    dataTypes,
    hasDataAccess: getHasDataAccess(allDatabases),
    error: databasesError || hasModelsError,
    isLoading: areDatabasesLoading || isHasModelsLoading,
  };
};

function DataPicker({
  value,
  filters: customFilters,
  ...props
}: DataPickerProps) {
  const {
    databases,
    dataTypes: allDataTypes,
    error,
    hasDataAccess,
    isLoading,
  } = useDataPickerConfig();

  const { onChange } = props;
  const { search } = useDataPicker();

  const filters = useMemo(
    () => ({ ...DEFAULT_DATA_PICKER_FILTERS, ...customFilters }),
    [customFilters],
  );

  const dataTypes = useMemo(() => {
    return allDataTypes.filter(type => filters.types(type.id));
  }, [allDataTypes, filters]);

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

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(DataPicker, {
  Provider: DataPickerContextProvider,
});
