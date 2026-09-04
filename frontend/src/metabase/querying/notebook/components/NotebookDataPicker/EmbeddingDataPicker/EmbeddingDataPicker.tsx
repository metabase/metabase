import { useContext } from "react";

import { skipToken, useGetCardQuery, useSearchQuery } from "metabase/api";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { EmbeddingDataPickerContext } from "metabase/querying/notebook/components/NotebookDataPicker/EmbeddingDataPicker/context";
import { useSelector } from "metabase/redux";
import {
  DEFAULT_EMBEDDING_ENTITY_TYPES,
  getDataPicker,
  getEntityTypes,
} from "metabase/redux/embedding-data-picker";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";
import * as Lib from "metabase-lib";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

import { DataPickerTarget } from "../DataPickerTarget";

type EmbeddingDataPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.TableMetadata | Lib.CardMetadata | undefined;
  title: string;
  placeholder: string;
  canChangeDatabase: boolean;
  isDisabled: boolean;
  onChange: (tableId: TableId) => void;
};
export function EmbeddingDataPicker({
  query,
  stageIndex,
  table,
  title,
  placeholder,
  canChangeDatabase,
  isDisabled,
  onChange,
}: EmbeddingDataPickerProps) {
  const { data: dataSourceCountData, isLoading: isDataSourceCountLoading } =
    useSearchQuery({
      models: ["dataset", "table"],
      limit: 0,
      context: "data-picker",
    });

  const databaseId = Lib.databaseID(query);
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
  const entityTypesFromRedux = useSelector(getEntityTypes);
  const dataPickerFromRedux = useSelector(getDataPicker);
  const queryingContext = useContext(EmbeddingDataPickerContext);

  /**
   * It's by design that we have to check values from both the context and Redux,
   * unlike the dashboard where we always get the values from only the context.
   * Because it's impossible to determine all querying parent components and wrap
   * them with the context provider.
   */
  const entityTypes = queryingContext?.entityTypes ?? entityTypesFromRedux;
  const dataPicker = queryingContext?.dataPicker ?? dataPickerFromRedux;
  const forceMultiStagedDataPicker = dataPicker === "staged";

  const {
    sourceId,
    sourceType,
    collectionId: sourceModelCollectionId,
    isFetching: isSourceModelFetching,
  } = useSourceEntity(query);

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
        : DEFAULT_EMBEDDING_ENTITY_TYPES;
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
            table={table}
            query={query}
            stageIndex={stageIndex}
            setIsOpened={() => {}}
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
          : `${sourceId}:${isSourceModelFetching}`
      }
      isInitiallyOpen={isSourceModelFetching ? false : !table}
      querySourceType={sourceType}
      canChangeDatabase={canChangeDatabase}
      selectedDatabaseId={databaseId}
      selectedTableId={pickerInfo?.tableId}
      selectedCollectionId={
        normalizedCard?.collection_id ?? sourceModelCollectionId
      }
      canSelectModel={entityTypes.includes("model")}
      canSelectTable={entityTypes.includes("table")}
      canSelectQuestion={entityTypes.includes("question")}
      popoverAriaLabel={title}
      triggerElement={
        <DataPickerTarget
          table={table}
          query={query}
          stageIndex={stageIndex}
          setIsOpened={() => {
            /* intentionally empty */
          }}
          placeholder={placeholder}
          isDisabled={isDisabled}
        />
      }
      setSourceTableFn={onChange}
    />
  );
}

/**
 * The query's source, which is either a table or a card behind a virtual table
 * id. Only a card has a type and a collection.
 */
function useSourceEntity(query: Lib.Query) {
  const sourceId = Lib.sourceTableOrCardId(query);
  const cardId = getQuestionIdFromVirtualTableId(sourceId);
  const { data: card, isFetching } = useGetCardQuery(
    cardId != null ? { id: cardId } : skipToken,
  );
  const isModelOrQuestion = card?.type === "model" || card?.type === "question";

  return {
    sourceId,
    sourceType: card?.type,
    collectionId: isModelOrQuestion ? card.collection_id : undefined,
    isFetching,
  };
}
