import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import { getHasDataAccess } from "metabase/selectors/data";
import { getSetting } from "metabase/selectors/settings";

import { useOnMount } from "metabase/hooks/use-on-mount";

import Databases from "metabase/entities/databases";
import Search from "metabase/entities/search";

import type { State } from "metabase-types/store";

import {
  getRootCollectionVirtualSchemaId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";

import type {
  DataPickerProps as DataPickerOwnProps,
  DataPickerDataType,
} from "./types";

import { DataPickerContextProvider, useDataPicker } from "./DataPickerContext";
import { getDataTypes, DEFAULT_DATA_PICKER_FILTERS } from "./utils";

import DataPickerView from "./DataPickerView";

interface DataPickerStateProps {
  hasNestedQueriesEnabled: boolean;
  hasDataAccess: boolean;
}

interface SearchListLoaderProps {
  search: unknown[];
}

type DataPickerProps = DataPickerOwnProps &
  DataPickerStateProps &
  SearchListLoaderProps;

function mapStateToProps(state: State) {
  return {
    hasNestedQueriesEnabled: getSetting(state, "enable-nested-queries"),
    hasDataAccess: getHasDataAccess(state),
  };
}

function DataPicker({
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

  const dataTypes = useMemo(
    () =>
      getDataTypes({
        hasModels: modelLookupResult.length > 0,
        hasNestedQueriesEnabled,
      }).filter(type => filters.types(type.id)),
    [filters, modelLookupResult, hasNestedQueriesEnabled],
  );

  const handleDataTypeChange = useCallback(
    (type: DataPickerDataType) => {
      const isModels = type === "models";
      const isUsingVirtualTables = isModels || type === "questions";

      // When switching to models or questions,
      // we want to automatically open Our analytics collection
      const databaseId = isUsingVirtualTables
        ? SAVED_QUESTIONS_VIRTUAL_DB_ID
        : undefined;
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
    [onChange],
  );

  useOnMount(() => {
    if (dataTypes.length === 1) {
      handleDataTypeChange(dataTypes[0].id);
    }
  });

  const handleBack = useCallback(() => {
    onChange({
      type: undefined,
      databaseId: undefined,
      schemaId: undefined,
      tableIds: [],
    });
  }, [onChange]);

  return (
    <DataPickerView
      {...props}
      dataTypes={dataTypes}
      searchQuery={search.query}
      hasDataAccess={hasDataAccess}
      onDataTypeChange={handleDataTypeChange}
      onBack={handleBack}
    />
  );
}

const DataPickerContainer = _.compose(
  // Required for `hasDataAccess` check
  Databases.loadList(),

  // Lets the picker check there is
  // at least one model, to offer for selection
  Search.loadList({
    query: {
      models: "dataset",
      limit: 1,
    },
  }),

  connect(mapStateToProps),
)(DataPicker);

export default Object.assign(DataPickerContainer, {
  Provider: DataPickerContextProvider,
});
