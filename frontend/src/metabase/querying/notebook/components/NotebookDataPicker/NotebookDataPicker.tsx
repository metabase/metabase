import { useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  DataPickerModal,
  type DataPickerValue,
  getDataPickerValue,
  shouldDisableItemNotInDb,
} from "metabase/common/components/Pickers/DataPicker";
import { MiniPicker } from "metabase/common/components/Pickers/MiniPicker";
import type {
  MiniPickerItem,
  MiniPickerPickableItem,
} from "metabase/common/components/Pickers/MiniPicker/types";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import type { QueryEditorDatabasePickerItem } from "metabase/querying/editor/types";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getIsEmbedding } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import { getIsTenantUser } from "metabase/selectors/user";
import { Icon, TextInput } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

import {
  type NotebookContextType,
  useNotebookContext,
} from "../Notebook/context";
import { NotebookCellItem } from "../NotebookCell";

import { EmbeddingDataPicker } from "./EmbeddingDataPicker";
import { isObjectWithModel } from "./utils";

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
  shouldDisableItem?: (item: OmniPickerItem) => boolean;
  shouldDisableDatabase?: (item: QueryEditorDatabasePickerItem) => boolean;
  columnPicker: React.ReactNode;
  shouldShowLibrary?: boolean;
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
  shouldDisableDatabase,
  shouldShowLibrary,
  columnPicker,
}: NotebookDataPickerProps) {
  const store = useStore();
  const dispatch = useDispatch();
  const onChangeRef = useLatest(onChange);
  const isEmbedding = useSelector(getIsEmbedding);
  const isTenantUser = useSelector(getIsTenantUser);

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
  const isRaw = useMemo(() => {
    return (
      Lib.aggregations(query, stageIndex).length === 0 &&
      Lib.breakouts(query, stageIndex).length === 0
    );
  }, [query, stageIndex]);

  // EMB-1144: force the embedding picker if user is a tenant user.
  //           this is to support the sidecar use-case where tenant users are given instance logins.
  if (isEmbedding || isTenantUser) {
    const canSelectTableColumns = table && isRaw && !isDisabled;
    return (
      <NotebookCellItem
        color="brand"
        inactive={!table}
        right={canSelectTableColumns && columnPicker}
        containerStyle={{ padding: 0 }}
        rightContainerStyle={{ width: 37, padding: 0 }}
        data-testid="data-step-cell"
        disabled={isDisabled}
      >
        <EmbeddingDataPicker
          query={query}
          stageIndex={stageIndex}
          table={table}
          placeholder={placeholder}
          canChangeDatabase={canChangeDatabase}
          isDisabled={isDisabled}
          onChange={handleChange}
        />
      </NotebookCellItem>
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
        shouldDisableDatabase={shouldDisableDatabase}
        shouldShowLibrary={shouldShowLibrary}
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
  shouldDisableItem?: (item: OmniPickerItem) => boolean;
  shouldDisableDatabase?: (database: QueryEditorDatabasePickerItem) => boolean;
  shouldShowLibrary?: boolean;
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
  shouldDisableDatabase,
  shouldShowLibrary,
}: ModernDataPickerProps) {
  const context = useNotebookContext();
  const modelList = getModelFilterList(context, hasMetrics);

  const databaseId = Lib.databaseID(query) ?? undefined;

  const tableValue =
    table != null ? getDataPickerValue(query, stageIndex, table) : undefined;
  const [dataSourceSearchQuery, setDataSourceSearchQuery] = useState("");
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [focusPicker, setFocusPicker] = useState(false);

  const shouldHide = useMemo(() => {
    const shouldDisableBasedOnDb = !canChangeDatabase
      ? shouldDisableItemNotInDb(databaseId)
      : () => false;

    return (item: MiniPickerItem | unknown): item is MiniPickerPickableItem => {
      // FIXME: eww gross need to normalize db ids in minipicker
      const dbId =
        !!item &&
        typeof item === "object" &&
        ("db_id" in item
          ? item.db_id
          : "database_id" in item
            ? item.database_id
            : undefined);

      return Boolean(
        // @ts-expect-error - Please fix 🥺
        shouldDisableBasedOnDb({ ...item, database_id: dbId }) ||
          shouldDisableItem?.(item as OmniPickerItem) ||
          (isObjectWithModel(item) &&
            item.model === "database" &&
            shouldDisableDatabase?.(item as QueryEditorDatabasePickerItem)),
      );
    };
  }, [databaseId, canChangeDatabase, shouldDisableItem, shouldDisableDatabase]);

  // when you can't change databases, let's default to
  // selecting that database in the picker
  const defaultDbValue = canChangeDatabase
    ? undefined
    : ({
        id: databaseId,
        model: "database" as "table", // 🤫
      } as DataPickerValue);

  return (
    <>
      <MiniPicker
        value={tableValue}
        opened={isOpened && !isBrowsing}
        onClose={() => setIsOpened(false)}
        models={modelList}
        searchQuery={dataSourceSearchQuery}
        onBrowseAll={() => setIsBrowsing(true)}
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
        shouldHide={shouldHide}
        shouldShowLibrary={shouldShowLibrary}
      />
      {isOpened && isBrowsing && (
        <DataPickerModal
          title={title}
          value={tableValue ?? defaultDbValue}
          onlyDatabaseId={canChangeDatabase ? undefined : databaseId}
          models={modelList}
          onChange={onChange}
          onClose={() => {
            setIsBrowsing(false);
            setIsOpened(false);
          }}
          shouldDisableItem={(i) => {
            return Boolean(
              shouldDisableItem?.(i) ||
                ("model" in i &&
                  i.model === "database" &&
                  shouldDisableDatabase?.(i)),
            );
          }}
          // searchQuery={dataSourceSearchQuery} ?
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
              e.preventDefault();
              e.stopPropagation();
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
