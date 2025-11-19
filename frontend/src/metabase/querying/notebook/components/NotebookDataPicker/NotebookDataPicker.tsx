import { useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import {
  type DataPickerItem,
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/Pickers/DataPicker";
import { MiniPicker } from "metabase/common/components/Pickers/MiniPicker";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getIsEmbedding } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import { Icon, TextInput } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { RecentCollectionItem, TableId } from "metabase-types/api";

import {
  type NotebookContextType,
  useNotebookContext,
} from "../Notebook/context";

import { EmbeddingDataPicker } from "./EmbeddingDataPicker";

export interface NotebookDataPickerProps {
  title: string;
  query: Lib.Query;
  stageIndex: number;
  table: Lib.TableMetadata | Lib.CardMetadata | undefined;
  placeholder?: string;
  canChangeDatabase: boolean;
  hasMetrics: boolean;
  isDisabled: boolean;
  isOpened: boolean;
  setIsOpened: (isOpened: boolean) => void;
  onChange: (
    table: Lib.TableMetadata | Lib.CardMetadata,
    metadataProvider: Lib.MetadataProvider,
  ) => void;
  shouldDisableItem?: (
    item: DataPickerItem | CollectionPickerItem | RecentCollectionItem,
  ) => boolean;
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
  isOpened,
  setIsOpened,
  onChange,
  shouldDisableItem,
}: NotebookDataPickerProps) {
  const store = useStore();
  const dispatch = useDispatch();
  const onChangeRef = useLatest(onChange);
  const isEmbedding = useSelector(getIsEmbedding);

  const handleChange = async (tableId: TableId) => {
    await dispatch(loadMetadataForTable(tableId));
    const metadata = getMetadata(store.getState());
    const databaseId = checkNotNull(metadata.table(tableId)).db_id;
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
    if (table) {
      onChangeRef.current?.(table, metadataProvider);
    }
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
        isOpened={isOpened}
        setIsOpened={setIsOpened}
        isDisabled={isDisabled}
        onChange={handleChange}
        shouldDisableItem={shouldDisableItem}
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
  isOpened: boolean;
  setIsOpened: (isOpened: boolean) => void;
  canChangeDatabase: boolean;
  hasMetrics: boolean;
  isDisabled: boolean;
  onChange: (tableId: TableId) => void;
  shouldDisableItem?: (
    item: DataPickerItem | CollectionPickerItem | RecentCollectionItem,
  ) => boolean;
};

function ModernDataPicker({
  query,
  stageIndex,
  table,
  title,
  isOpened,
  setIsOpened,
  canChangeDatabase,
  hasMetrics,
  isDisabled,
  onChange,
  shouldDisableItem,
}: ModernDataPickerProps) {
  const context = useNotebookContext();
  const modelList = getModelFilterList(context, hasMetrics);

  const databaseId = Lib.databaseID(query) ?? undefined;

  const tableValue =
    table != null ? getDataPickerValue(query, stageIndex, table) : undefined;
  const [dataSourceSearchQuery, setDataSourceSearchQuery] = useState("");
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [focusPicker, setFocusPicker] = useState(false);

  return (
    <>
      <MiniPicker
        value={tableValue}
        opened={isOpened && !isBrowsing}
        onClose={() => setIsOpened(false)}
        models={["table", "dataset", "metric", "card"]}
        searchQuery={dataSourceSearchQuery}
        onBrowseAll={() => setIsBrowsing(true)}
        clearSearchQuery={() => setDataSourceSearchQuery("")}
        trapFocus={focusPicker}
        onChange={(value: MiniPickerPickableItem) => {
          const id =
            value.model === "table"
              ? value.id
              : getQuestionVirtualTableId(value.id);
          onChange(id);
          setDataSourceSearchQuery("");
          setIsOpened(false);
        }}
      />
      {isOpened && isBrowsing && (
        <DataPickerModal
          title={title}
          value={tableValue}
          databaseId={canChangeDatabase ? undefined : databaseId}
          models={modelList}
          onChange={(i) => {
            onChange(i);
          }}
          onClose={() => {
            setIsBrowsing(false);
            setIsOpened(false);
          }}
          shouldDisableItem={shouldDisableItem}
        />
      )}
      {isOpened || !table ? (
        <TextInput
          placeholder={t`Search for tables and more...`}
          value={dataSourceSearchQuery}
          variant="unstyled"
          styles={{
            input: { background: "transparent ", border: "none", p: 0 },
          }}
          leftSection={<Icon name="search" />}
          onChange={(e) => setDataSourceSearchQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "tab") {
              setFocusPicker(true);
            }
          }}
          onClickCapture={(e) => {
            e.stopPropagation();
            setIsOpened(true);
            setFocusPicker(false);
          }}
          miw="20rem"
          autoFocus={isOpened}
          disabled={isDisabled}
        />
      ) : null}
    </>
  );
}

function getModelFilterList(
  { modelsFilterList }: NotebookContextType,
  hasMetrics: boolean,
) {
  if (hasMetrics) {
    return modelsFilterList;
  } else {
    return modelsFilterList.filter((model) => model !== "metric");
  }
}
