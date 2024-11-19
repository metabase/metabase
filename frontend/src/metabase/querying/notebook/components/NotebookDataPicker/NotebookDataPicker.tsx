import { type MouseEvent, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/DataPicker";
import { METAKEY } from "metabase/lib/browser";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import type { IconName } from "metabase/ui";
import { Flex, Icon, Tooltip, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatabaseId, TableId } from "metabase-types/api";

import { useNotebookContext } from "../Notebook/context";
import { NotebookCell } from "../NotebookCell";

import { getUrl } from "./utils";

interface NotebookDataPickerProps {
  title: string;
  query: Lib.Query;
  stageIndex: number;
  table?: Lib.TableMetadata | Lib.CardMetadata;
  databaseId?: DatabaseId;
  placeholder?: string;
  hasMetrics?: boolean;
  isDisabled?: boolean;
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
  databaseId,
  placeholder = title,
  hasMetrics = false,
  isDisabled,
  onChange,
}: NotebookDataPickerProps) {
  const { modelsFilterList } = useNotebookContext();
  const filterList = hasMetrics
    ? modelsFilterList
    : modelsFilterList.filter(model => model !== "metric");

  const [isOpen, setIsOpen] = useState(!table);
  const store = useStore();
  const dispatch = useDispatch();
  const onChangeRef = useLatest(onChange);

  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);

  const tableInfo = useMemo(
    () => table && Lib.displayInfo(query, stageIndex, table),
    [query, stageIndex, table],
  );

  const tableValue = useMemo(
    () => table && getDataPickerValue(query, stageIndex, table),
    [query, stageIndex, table],
  );

  const handleChange = async (tableId: TableId) => {
    await dispatch(loadMetadataForTable(tableId));
    const metadata = getMetadata(store.getState());
    const databaseId = checkNotNull(metadata.table(tableId)).db_id;
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
    onChangeRef.current?.(table, metadataProvider);
  };

  const openDataSourceInNewTab = () => {
    const url = getUrl({ query, table, stageIndex });

    if (!url) {
      return;
    }

    const subpathSafeUrl = Urls.getSubpathSafeUrl(url);
    Urls.openInNewTab(subpathSafeUrl);
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const isCtrlOrMetaClick =
      (event.ctrlKey || event.metaKey) && event.button === 0;

    isCtrlOrMetaClick && !isEmbeddingSdk
      ? openDataSourceInNewTab()
      : setIsOpen(true);
  };

  const handleAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
    const isMiddleClick = event.button === 1;

    isMiddleClick && !isEmbeddingSdk
      ? openDataSourceInNewTab()
      : setIsOpen(true);
  };

  return (
    <>
      <Tooltip
        label={t`${METAKEY}+click to open in new tab`}
        hidden={!table || isEmbeddingSdk}
        events={{
          hover: true,
          focus: false,
          touch: false,
        }}
      >
        <UnstyledButton
          c="inherit"
          fz="inherit"
          fw="inherit"
          p={NotebookCell.CONTAINER_PADDING}
          disabled={isDisabled}
          onClick={handleClick}
          onAuxClick={handleAuxClick}
        >
          <Flex align="center" gap="xs">
            {tableInfo && (
              <Icon name={getTableIcon(tableInfo)} style={{ flexShrink: 0 }} />
            )}
            {tableInfo?.displayName ?? placeholder}
          </Flex>
        </UnstyledButton>
      </Tooltip>
      {isOpen && (
        <DataPickerModal
          title={title}
          value={tableValue}
          databaseId={databaseId}
          models={filterList}
          onChange={handleChange}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

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
