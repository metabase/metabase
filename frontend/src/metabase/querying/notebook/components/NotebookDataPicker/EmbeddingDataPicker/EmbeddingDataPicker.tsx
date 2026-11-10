import { useContext } from "react";

import { skipToken, useGetCardQuery, useSearchQuery } from "metabase/api";
import type { DataSource } from "metabase/embedding-sdk/types/components/data-picker";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { EmbeddingDataPickerContext } from "metabase/querying/notebook/components/NotebookDataPicker/EmbeddingDataPicker/context";
import { useSelector } from "metabase/redux";
import {
  DEFAULT_EMBEDDING_ENTITY_TYPES,
  getDataPicker,
  getEntityTypes,
} from "metabase/redux/embedding-data-picker";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";
import { useSetting } from "metabase/settings";
import * as Lib from "metabase-lib";

import { DataPickerTarget } from "../DataPickerTarget";

type EmbeddingDataPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.TableMetadata | Lib.CardMetadata | undefined;
  title: string;
  placeholder: string;
  canChangeDatabase: boolean;
  isDisabled: boolean;
  onChange: (source: DataSource) => void;
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
      models: ["dataset", "table", "metric"],
      limit: 0,
      context: "data-picker",
    });

  const databaseId = Lib.databaseID(query);
  const selectedSource = getSelectedSource(query, table);
  const selectedCardId =
    selectedSource?.type === "card" ? selectedSource.id : undefined;
  const { data: card } = useGetCardQuery(
    selectedCardId != null ? { id: selectedCardId } : skipToken,
  );
  /**
   * This is when we change the starting query source, and `card` is already cached.
   * If we use `card` as is, it will use the cached data from a different query source
   * which is incorrect.
   */
  const normalizedCard = selectedCardId != null ? card : undefined;
  const entityTypesFromRedux = useSelector(getEntityTypes);
  const dataPickerFromRedux = useSelector(getDataPicker);
  const hasNestedQueriesEnabled = useSetting("enable-nested-queries");
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
    sourceCardId,
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
    const isJoinStep = !canChangeDatabase;
    const canSelectMetric = !isJoinStep && hasNestedQueriesEnabled;
    const ALLOWED_SIMPLE_DATA_PICKER_ENTITY_TYPES: EmbeddingEntityType[] = [
      ...(hasNestedQueriesEnabled ? (["model"] as const) : []),
      "table",
      "semantic-layer",
      ...(canSelectMetric ? (["metric"] as const) : []),
    ];
    const isAllowedEntityType = (entityType: EmbeddingEntityType) =>
      ALLOWED_SIMPLE_DATA_PICKER_ENTITY_TYPES.includes(entityType);
    const filteredEntityTypes = entityTypes.filter(isAllowedEntityType);
    const simpleDataPickerEntityTypes =
      filteredEntityTypes.length > 0
        ? filteredEntityTypes
        : DEFAULT_EMBEDDING_ENTITY_TYPES.filter(isAllowedEntityType);
    return (
      <PLUGIN_EMBEDDING.SimpleDataPicker
        filterByDatabaseId={canChangeDatabase ? null : databaseId}
        isJoinStep={isJoinStep}
        selectedSource={selectedSource}
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
        setSourceFn={onChange}
        entityTypes={simpleDataPickerEntityTypes}
      />
    );
  }

  return (
    <PLUGIN_EMBEDDING.DataSourceSelector
      key={
        selectedSource != null
          ? `${selectedSource.type}:${selectedSource.id}`
          : `${sourceCardId}:${isSourceModelFetching}`
      }
      isInitiallyOpen={isSourceModelFetching ? false : !table}
      querySourceType={sourceType}
      canChangeDatabase={canChangeDatabase}
      selectedDatabaseId={databaseId}
      selectedTableId={
        selectedSource?.type === "table" ? selectedSource.id : undefined
      }
      selectedCardId={
        selectedSource?.type === "card" ? selectedSource.id : undefined
      }
      selectedCollectionId={
        normalizedCard?.collection_id ?? sourceModelCollectionId
      }
      canSelectModel={entityTypes.includes("model")}
      canSelectTable={entityTypes.includes("table")}
      canSelectQuestion={entityTypes.includes("question")}
      canSelectMetric={entityTypes.includes("metric")}
      canSelectSemanticLayer={entityTypes.includes("semantic-layer")}
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
      setSourceFn={onChange}
    />
  );
}

function getSelectedSource(
  query: Lib.Query,
  table: Lib.TableMetadata | Lib.CardMetadata | undefined,
): DataSource | undefined {
  if (Lib.isCardMetadata(table)) {
    return { type: "card", id: Lib.pickerInfo(query, table).id };
  }
  if (Lib.isTableMetadata(table)) {
    return { type: "table", id: Lib.pickerInfo(query, table).id };
  }
  return undefined;
}

function useSourceEntity(query: Lib.Query) {
  const sourceCardId = Lib.primarySourceCardId(query);
  const { data: card, isFetching } = useGetCardQuery(
    sourceCardId != null ? { id: sourceCardId } : skipToken,
  );
  const isModelOrQuestion = card?.type === "model" || card?.type === "question";

  return {
    sourceCardId,
    sourceType: card?.type,
    collectionId: isModelOrQuestion ? card.collection_id : undefined,
    isFetching,
  };
}
