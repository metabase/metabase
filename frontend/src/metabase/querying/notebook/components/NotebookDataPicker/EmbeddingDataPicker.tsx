import { useMemo } from "react";

import { skipToken, useGetCardQuery, useSearchQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { getEmbedOptions } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

import { DataPickerTarget } from "./NotebookDataPicker";

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

  const metadata = useSelector(getMetadata);
  const databases = useMemo(() => {
    // We're joining data
    if (!canChangeDatabase) {
      return [
        metadata.database(databaseId),
        metadata.savedQuestionsDatabase(),
      ].filter(Boolean);
    }

    /**
     * When not joining data, we want to use all databases loaded inside `DataSourceSelector`
     *
     * @see https://github.com/metabase/metabase/blob/fb25682fe8dbafe2062e37bce832f62440872ab7/frontend/src/metabase/query_builder/components/DataSelector/DataSelector.jsx#L1163-L1168
     */
    return undefined;
  }, [canChangeDatabase, databaseId, metadata]);

  const entityTypes = useSelector(state => getEmbedOptions(state).entity_types);

  if (isDataSourceCountLoading) {
    return null;
  }

  const shouldUseSimpleDataPicker =
    dataSourceCountData != null && dataSourceCountData.total < 100;
  if (shouldUseSimpleDataPicker) {
    return (
      <PLUGIN_EMBEDDING_SDK.SimpleDataPicker
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
      />
    );
  }

  return (
    <DataSourceSelector
      key={pickerInfo?.tableId}
      isInitiallyOpen={!table}
      databases={databases}
      canChangeDatabase={canChangeDatabase}
      selectedDatabaseId={databaseId}
      selectedTableId={pickerInfo?.tableId}
      selectedCollectionId={card?.collection_id}
      databaseQuery={{ saved: true }}
      canSelectModel={entityTypes.includes("model")}
      canSelectTable={entityTypes.includes("table")}
      canSelectMetric={false}
      canSelectSavedQuestion={false}
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
