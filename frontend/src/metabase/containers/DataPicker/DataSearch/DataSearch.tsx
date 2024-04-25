import { useCallback, useMemo } from "react";

import { SearchResults } from "metabase/query_builder/components/DataSelector/data-search";
import {
  getCollectionVirtualSchemaId,
  getQuestionVirtualTableId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type { Collection } from "metabase-types/api";

import { useDataPicker } from "../DataPickerContext";
import type { DataPickerValue, DataPickerDataType } from "../types";

interface DataSearchProps {
  searchQuery: string;
  availableDataTypes: DataPickerDataType[];
  onChange: (value: DataPickerValue) => void;
}

type TableSearchResult = {
  id: number;
  database_id: number;
  table_schema: string;
  table_id: number;
  model: "table" | "dataset" | "card";
  collection: Collection | null;
};

type SearchModel = "card" | "dataset" | "table";

const DATA_TYPE_SEARCH_MODEL_MAP: Record<DataPickerDataType, SearchModel> = {
  "raw-data": "table",
  models: "dataset",
  questions: "card",
};

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
    type,
    databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
    schemaId,
    collectionId: table.collection?.id || "root",
    tableIds: [getQuestionVirtualTableId(table.id)],
  };
}

function getNextValue(table: TableSearchResult): DataPickerValue {
  const type = getDataTypeForSearchResult(table);
  const isVirtualTable = type === "models" || type === "questions";
  return isVirtualTable
    ? getValueForVirtualTable(table)
    : getValueForRawTable(table);
}

function DataSearch({
  searchQuery,
  availableDataTypes,
  onChange,
}: DataSearchProps) {
  const { search } = useDataPicker();
  const { setQuery } = search;

  const searchModels: SearchModel[] = useMemo(() => {
    return availableDataTypes.map(type => DATA_TYPE_SEARCH_MODEL_MAP[type]);
  }, [availableDataTypes]);

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
      searchModels={searchModels}
      searchQuery={searchQuery.trim()}
      onSelect={onSelect}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSearch;
