import { skipToken, useGetCardQuery, useSearchQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getEmbedOptions } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

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

  const entityTypes = useSelector(
    (state) => getEmbedOptions(state).entity_types,
  );

  const sourceTable = useSourceTable(query);
  const isSourceModel = sourceTable?.type === "model";
  const {
    collectionId: sourceModelCollectionId,
    isFetching: isSourceModelFetching,
  } = useSourceModelCollectionId(query);

  if (isDataSourceCountLoading) {
    return null;
  }

  const shouldUseSimpleDataPicker =
    dataSourceCountData != null && dataSourceCountData.total < 100;
  if (shouldUseSimpleDataPicker) {
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
        entityTypes={entityTypes}
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
      isQuerySourceModel={isSourceModel}
      canChangeDatabase={canChangeDatabase}
      selectedDatabaseId={databaseId}
      selectedTableId={pickerInfo?.tableId}
      selectedCollectionId={card?.collection_id ?? sourceModelCollectionId}
      canSelectModel={entityTypes.includes("model")}
      canSelectTable={entityTypes.includes("table")}
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

function useSourceModelCollectionId(query: Lib.Query) {
  const sourceTable = useSourceTable(query);
  const isSourceModel = sourceTable?.type === "model";
  const modelId = isSourceModel
    ? getQuestionIdFromVirtualTableId(sourceTable?.id)
    : undefined;
  const { data: modelCard, isFetching } = useGetCardQuery(
    modelId ? { id: modelId } : skipToken,
  );

  return { collectionId: modelCard?.collection_id, isFetching };
}
