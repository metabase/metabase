import React, { useCallback } from "react";

import { SearchResults } from "metabase/query_builder/components/DataSelector/data-search";

import type { Collection } from "metabase-types/api";

import {
  getCollectionVirtualSchemaId,
  getQuestionVirtualTableId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/lib/metadata/utils/saved-questions";
import { generateSchemaId } from "metabase-lib/lib/metadata/utils/schema";

import { useDataPicker } from "../DataPickerContext";

import { DataPickerValue, DataPickerDataType } from "../types";

interface DataSearchProps {
  value: DataPickerValue;
  searchQuery: string;
  onChange: (value: DataPickerValue) => void;
}

type TableSearchResult = {
  database_id: number;
  table_schema: string;
  table_id: number;
  model: "table" | "dataset" | "card";
  collection: Collection | null;
};

const SEARCH_MODELS = ["table", "dataset", "card"];

function getDataTypeForSearchResult(
  table: TableSearchResult,
): DataPickerDataType {
  switch (table.model) {
    case "table":
      return "raw-data";
    case "card":
      return "questions";
    case "dataset":
      return "models";
  }
}

function getValueForRawTable(table: TableSearchResult): DataPickerValue {
  return {
    type: "raw-data",
    databaseId: table.database_id,
    schemaId: generateSchemaId(table.database_id, table.table_schema),
    collectionId: undefined,
    tableIds: [table.table_id],
  };
}

function getValueForVirtualTable(table: TableSearchResult): DataPickerValue {
  const type = getDataTypeForSearchResult(table);
  const schemaId = getCollectionVirtualSchemaId(table.collection, {
    isDatasets: type === "models",
  });
  return {
    type: "models",
    databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
    schemaId,
    collectionId: table.collection?.id || "root",
    tableIds: [getQuestionVirtualTableId(table)],
  };
}

function getNextValue(table: TableSearchResult): DataPickerValue {
  const type = getDataTypeForSearchResult(table);
  const isVirtualTable = type === "models" || type === "questions";
  return isVirtualTable
    ? getValueForVirtualTable(table)
    : getValueForRawTable(table);
}

function DataSearch({ value, searchQuery, onChange }: DataSearchProps) {
  const { search } = useDataPicker();
  const { setQuery } = search;

  const databaseId = value.databaseId ? String(value.databaseId) : null;

  const onSelect = useCallback(
    (table: TableSearchResult) => {
      const nextValue = getNextValue(table);
      onChange(nextValue);
      setQuery("");
    },
    [onChange, setQuery],
  );

  return (
    <SearchResults
      searchModels={SEARCH_MODELS as any}
      searchQuery={searchQuery.trim()}
      databaseId={databaseId}
      onSelect={onSelect}
    />
  );
}

export default DataSearch;
