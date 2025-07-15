import { useMemo } from "react";

import { skipToken, useGetCardQuery, useSearchQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { DEFAULT_EMBEDDING_ENTITY_TYPES } from "metabase/redux/embedding-data-picker";
import { getEmbedOptions } from "metabase/selectors/embed";
import { getEntityTypes } from "metabase/selectors/embedding-data-picker";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { CardType, TableId } from "metabase-types/api";
import type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

import { DataPickerTarget } from "../DataPickerTarget";

type EmbeddingDataPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.TableMetadata | Lib.CardMetadata | undefined;
  placeholder: string;
  canChangeDatabase: boolean;
  isDisabled: boolean;
  onChange: (tableId: TableId) => void;
};
export function EmbeddingDataPicker({
  query,
  stageIndex,
  table,
  placeholder,
  canChangeDatabase,
  isDisabled,
  onChange,
}: EmbeddingDataPickerProps) {
  const { data: dataSourceCountData, isLoading: isDataSourceCountLoading } =
    useSearchQuery({
      models: ["dataset", "table"],
      limit: 0,
    });

  const databaseId = Lib.databaseID(query);
  const tableInfo =
    table != null ? Lib.displayInfo(query, stageIndex, table) : undefined;
  const pickerInfo = table != null ? Lib.pickerInfo(query, table) : undefined;
  const { data: card } = useGetCardQuery(
    pickerInfo?.cardId != null ? { id: pickerInfo.cardId } : skipToken,
  );
  /**
   * This is when we change the starting query source, and `card` is already cached.
   * If we use `card` as is, it will use the cached data from a different query source
   * which is incorrect.
   */
  const normalizedCard = pickerInfo?.cardId ? card : undefined;

  const entityTypes = useSelector(getEntityTypes);
  const forceMultiStagedDataPicker = useSelector(
    (state) => getEmbedOptions(state).data_picker === "staged",
  );

  // a table or a virtual table (card)
  const sourceTable = useSourceTable(query);
  const {
    collectionId: sourceModelCollectionId,
    isFetching: isSourceModelFetching,
  } = useSourceEntityCollectionId(query);

  const defaultEmbeddingEntityTypes = useMemo(() => {
    const modelsCount = dataSourceCountData?.data.filter(
      (d) => d.model === "dataset",
    ).length;

    // If there are already models (datasets), we exclude tables
    // by default, as tables add noise to the data picker.
    return modelsCount && modelsCount > 0
      ? DEFAULT_EMBEDDING_ENTITY_TYPES.filter((type) => type !== "table")
      : DEFAULT_EMBEDDING_ENTITY_TYPES;
  }, [dataSourceCountData]);

  if (isDataSourceCountLoading) {
    return null;
  }

  const shouldUseSimpleDataPicker =
    !forceMultiStagedDataPicker &&
    dataSourceCountData != null &&
    dataSourceCountData.total < 100;

  if (shouldUseSimpleDataPicker) {
    const ALLOWED_SIMPLE_DATA_PICKER_ENTITY_TYPES: EmbeddingEntityType[] = [
      "model",
      "table",
    ];
    const filteredEntityTypes = entityTypes.filter((entityType) =>
      ALLOWED_SIMPLE_DATA_PICKER_ENTITY_TYPES.includes(entityType),
    );
    const simpleDataPickerEntityTypes =
      filteredEntityTypes.length > 0
        ? filteredEntityTypes
        : defaultEmbeddingEntityTypes;
    return (
      <PLUGIN_EMBEDDING.SimpleDataPicker
        filterByDatabaseId={canChangeDatabase ? null : databaseId}
        selectedEntity={pickerInfo?.tableId}
        isInitiallyOpen={!table}
        triggerElement={
          <DataPickerTarget
            /**
             * We try to blur the line between models and tables for embedding users.
             * this property will change the way icons are displayed in the data picker trigger,
             * so we need to remove it. Treating it as a table.
             */
            getTableIcon={() => "table"}
            tableInfo={tableInfo}
            placeholder={placeholder}
            isDisabled={isDisabled}
          />
        }
        setSourceTableFn={onChange}
        entityTypes={simpleDataPickerEntityTypes}
      />
    );
  }

  const isSourceSelected = Boolean(pickerInfo?.tableId);
  return (
    <PLUGIN_EMBEDDING.DataSourceSelector
      key={
        isSourceSelected
          ? pickerInfo?.tableId
          : `${sourceTable?.id}:${isSourceModelFetching}`
      }
      isInitiallyOpen={isSourceModelFetching ? false : !table}
      querySourceType={sourceTable?.type}
      canChangeDatabase={canChangeDatabase}
      selectedDatabaseId={databaseId}
      selectedTableId={pickerInfo?.tableId}
      selectedCollectionId={
        normalizedCard?.collection_id ?? sourceModelCollectionId
      }
      canSelectModel={entityTypes.includes("model")}
      canSelectTable={entityTypes.includes("table")}
      canSelectQuestion={entityTypes.includes("question")}
      triggerElement={
        <DataPickerTarget
          tableInfo={tableInfo}
          placeholder={placeholder}
          isDisabled={isDisabled}
        />
      }
      setSourceTableFn={onChange}
    />
  );
}

function useSourceTable(query: Lib.Query) {
  const metadata = useSelector(getMetadata);
  return metadata.table(Lib.sourceTableOrCardId(query));
}

function useSourceEntityCollectionId(query: Lib.Query) {
  const sourceTable = useSourceTable(query);
  const isCard =
    sourceTable?.type &&
    (["model", "question"] as CardType[]).includes(sourceTable.type);
  const cardId = isCard
    ? getQuestionIdFromVirtualTableId(sourceTable?.id)
    : undefined;
  const { data: card, isFetching } = useGetCardQuery(
    cardId ? { id: cardId } : skipToken,
  );

  return { collectionId: card?.collection_id, isFetching };
}
