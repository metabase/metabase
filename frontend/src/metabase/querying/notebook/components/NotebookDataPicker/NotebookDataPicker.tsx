import { type MouseEvent, type Ref, forwardRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/DataPicker";
import { METAKEY } from "metabase/lib/browser";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
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
      <LegacyDataPicker
        query={query}
        stageIndex={stageIndex}
        table={table}
        placeholder={placeholder}
        hasMetrics={hasMetrics}
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

type LegacyDataPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.TableMetadata | Lib.CardMetadata | undefined;
  placeholder: string;
  hasMetrics: boolean;
  isDisabled: boolean;
  onChange: (tableId: TableId) => void;
};

function LegacyDataPicker({
  query,
  stageIndex,
  table,
  placeholder,
  hasMetrics,
  isDisabled,
  onChange,
}: LegacyDataPickerProps) {
  const databaseId = Lib.databaseID(query);
  const tableInfo =
    table != null ? Lib.displayInfo(query, stageIndex, table) : undefined;
  const pickerInfo = table != null ? Lib.pickerInfo(query, table) : undefined;
  const { data: card } = useGetCardQuery(
    pickerInfo?.cardId != null ? { id: pickerInfo.cardId } : skipToken,
  );
  const context = useNotebookContext();
  const modelList = getModelFilterList(context, hasMetrics);

  return (
    <DataSourceSelector
      key={pickerInfo?.tableId}
      isInitiallyOpen={!table}
      selectedDatabaseId={databaseId}
      selectedTableId={pickerInfo?.tableId}
      selectedCollectionId={card?.collection_id}
      databaseQuery={{ saved: true }}
      canSelectMetric={modelList.includes("metric")}
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
};

const DataPickerTarget = forwardRef(function DataPickerTarget(
  {
    tableInfo,
    placeholder,
    isDisabled,
    onClick,
    onAuxClick,
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

function getTableIcon(tableInfo: Lib.TableDisplayInfo): IconName {
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
