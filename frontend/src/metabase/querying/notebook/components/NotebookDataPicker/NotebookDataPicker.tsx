import {
  type MouseEvent,
  type Ref,
  forwardRef,
  useMemo,
  useState,
} from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useSearchQuery } from "metabase/api";
import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/DataPicker";
import { METAKEY } from "metabase/lib/browser";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getIsEmbedded, getIsEmbeddingSdk } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import type { IconName } from "metabase/ui";
import { Flex, Icon, Tooltip, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

import {
  type NotebookContextType,
  useNotebookContext,
} from "../Notebook/context";
import { NotebookCell } from "../NotebookCell";

import { getUrl } from "./utils";

interface NotebookDataPickerProps {
  title: string;
  query: Lib.Query;
  stageIndex: number;
  table: Lib.TableMetadata | Lib.CardMetadata | undefined;
  placeholder?: string;
  canChangeDatabase: boolean;
  hasMetrics: boolean;
  isDisabled: boolean;
  onChange: (
    table: Lib.TableMetadata | Lib.CardMetadata,
    metadataProvider: Lib.MetadataProvider,
  ) => void;
}

export function NotebookDataPicker({
  title,
  query,
  stageIndex,
  table,
  placeholder = title,
  canChangeDatabase,
  hasMetrics,
  isDisabled,
  onChange,
}: NotebookDataPickerProps) {
  const store = useStore();
  const dispatch = useDispatch();
  const onChangeRef = useLatest(onChange);
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  const isEmbeddingIframe = useSelector(getIsEmbedded);
  const isEmbedding = isEmbeddingSdk || isEmbeddingIframe;

  const handleChange = async (tableId: TableId) => {
    await dispatch(loadMetadataForTable(tableId));
    const metadata = getMetadata(store.getState());
    const databaseId = checkNotNull(metadata.table(tableId)).db_id;
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
    onChangeRef.current?.(table, metadataProvider);
  };

  if (isEmbedding) {
    return (
      <EmbeddingDataPicker
        query={query}
        stageIndex={stageIndex}
        table={table}
        placeholder={placeholder}
        canChangeDatabase={canChangeDatabase}
        isDisabled={isDisabled}
        onChange={handleChange}
      />
    );
  } else {
    return (
      <ModernDataPicker
        query={query}
        stageIndex={stageIndex}
        table={table}
        title={title}
        placeholder={placeholder}
        canChangeDatabase={canChangeDatabase}
        hasMetrics={hasMetrics}
        isDisabled={isDisabled}
        onChange={handleChange}
      />
    );
  }
}

type ModernDataPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.TableMetadata | Lib.CardMetadata | undefined;
  title: string;
  placeholder: string;
  canChangeDatabase: boolean;
  hasMetrics: boolean;
  isDisabled: boolean;
  onChange: (tableId: TableId) => void;
};

function ModernDataPicker({
  query,
  stageIndex,
  table,
  title,
  placeholder,
  canChangeDatabase,
  hasMetrics,
  isDisabled,
  onChange,
}: ModernDataPickerProps) {
  const [isOpened, setIsOpened] = useState(!table);
  const context = useNotebookContext();
  const modelList = getModelFilterList(context, hasMetrics);

  const databaseId = Lib.databaseID(query) ?? undefined;
  const tableInfo =
    table != null ? Lib.displayInfo(query, stageIndex, table) : undefined;
  const tableValue =
    table != null ? getDataPickerValue(query, stageIndex, table) : undefined;

  const openDataSourceInNewTab = () => {
    const url = getUrl({ query, table, stageIndex });
    if (url) {
      const subpathSafeUrl = Urls.getSubpathSafeUrl(url);
      Urls.openInNewTab(subpathSafeUrl);
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const isCtrlOrMetaClick =
      (event.ctrlKey || event.metaKey) && event.button === 0;
    if (isCtrlOrMetaClick) {
      openDataSourceInNewTab();
    } else {
      setIsOpened(true);
    }
  };

  const handleAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
    const isMiddleClick = event.button === 1;
    if (isMiddleClick) {
      openDataSourceInNewTab();
    } else {
      setIsOpened(true);
    }
  };

  return (
    <>
      <Tooltip
        label={t`${METAKEY}+click to open in new tab`}
        hidden={!table}
        events={{ hover: true, focus: false, touch: false }}
      >
        <DataPickerTarget
          tableInfo={tableInfo}
          placeholder={placeholder}
          isDisabled={isDisabled}
          onClick={handleClick}
          onAuxClick={handleAuxClick}
        />
      </Tooltip>
      {isOpened && (
        <DataPickerModal
          title={title}
          value={tableValue}
          databaseId={canChangeDatabase ? undefined : databaseId}
          models={modelList}
          onChange={onChange}
          onClose={() => setIsOpened(false)}
        />
      )}
    </>
  );
}

type EmbeddingDataPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.TableMetadata | Lib.CardMetadata | undefined;
  placeholder: string;
  canChangeDatabase: boolean;
  isDisabled: boolean;
  onChange: (tableId: TableId) => void;
};

function EmbeddingDataPicker({
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

type DataPickerTargetProps = {
  tableInfo?: Lib.TableDisplayInfo;
  placeholder: string;
  isDisabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onAuxClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  getTableIcon?: (tableInfo: Lib.TableDisplayInfo) => IconName;
};

const DataPickerTarget = forwardRef(function DataPickerTarget(
  {
    tableInfo,
    placeholder,
    isDisabled,
    onClick,
    onAuxClick,
    getTableIcon = defaultGetTableIcon,
  }: DataPickerTargetProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <UnstyledButton
      ref={ref}
      c="inherit"
      fz="inherit"
      fw="inherit"
      p={NotebookCell.CONTAINER_PADDING}
      disabled={isDisabled}
      onClick={onClick}
      onAuxClick={onAuxClick}
    >
      <Flex align="center" gap="xs">
        {tableInfo && (
          <Icon name={getTableIcon(tableInfo)} style={{ flexShrink: 0 }} />
        )}
        {tableInfo?.displayName ?? placeholder}
      </Flex>
    </UnstyledButton>
  );
});

function defaultGetTableIcon(tableInfo: Lib.TableDisplayInfo): IconName {
  switch (true) {
    case tableInfo.isQuestion:
      return "table2";
    case tableInfo.isModel:
      return "model";
    case tableInfo.isMetric:
      return "metric";
    default:
      return "table";
  }
}

function getModelFilterList(
  { modelsFilterList }: NotebookContextType,
  hasMetrics: boolean,
) {
  if (hasMetrics) {
    return modelsFilterList;
  } else {
    return modelsFilterList.filter(model => model !== "metric");
  }
}
