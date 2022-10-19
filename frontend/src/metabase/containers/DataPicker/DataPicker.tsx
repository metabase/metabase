import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import { getSetting } from "metabase/selectors/settings";

import Search from "metabase/entities/search";

import type { State } from "metabase-types/store";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/lib/metadata/utils/saved-questions";

import type {
  DataPickerProps as DataPickerOwnProps,
  DataPickerDataType,
} from "./types";

import { getDataTypes } from "./utils";

import CardPicker from "./CardPicker";
import DataTypePicker from "./DataTypePicker";
import RawDataPicker from "./RawDataPicker";

interface DataPickerStateProps {
  hasNestedQueriesEnabled: boolean;
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
  };
}

function DataPicker({
  search: modelLookupResult,
  hasNestedQueriesEnabled,
  ...props
}: DataPickerProps) {
  const { value, onChange } = props;

  const dataTypes = useMemo(
    () =>
      getDataTypes({
        hasModels: modelLookupResult.length > 0,
        hasNestedQueriesEnabled,
      }),
    [modelLookupResult, hasNestedQueriesEnabled],
  );

  const handleDataTypeChange = useCallback(
    (type: DataPickerDataType) => {
      const isUsingVirtualTables = type === "models" || type === "questions";
      onChange({
        type,
        databaseId: isUsingVirtualTables
          ? SAVED_QUESTIONS_VIRTUAL_DB_ID
          : undefined,
        schemaId: undefined,
        tableIds: [],
      });
    },
    [onChange],
  );

  const handleBack = useCallback(() => {
    onChange({
      type: undefined,
      databaseId: undefined,
      schemaId: undefined,
      tableIds: [],
    });
  }, [onChange]);

  if (!value.type) {
    return <DataTypePicker types={dataTypes} onChange={handleDataTypeChange} />;
  }

  if (value.type === "raw-data") {
    return <RawDataPicker {...props} onBack={handleBack} />;
  }

  if (value.type === "models") {
    return <CardPicker {...props} targetModel="model" onBack={handleBack} />;
  }

  if (value.type === "questions") {
    return <CardPicker {...props} targetModel="question" onBack={handleBack} />;
  }

  return null;
}

export default _.compose(
  Search.loadList({
    // Lets the picker check there is
    // at least one model, to offer for selection
    query: {
      models: "dataset",
      limit: 1,
    },
  }),
  connect(mapStateToProps),
)(DataPicker);
