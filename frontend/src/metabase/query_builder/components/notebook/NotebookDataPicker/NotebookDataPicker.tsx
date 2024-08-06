import { useMemo, useState, type MouseEvent } from "react";
import { useLatest } from "react-use";

import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/DataPicker";
import { useDispatch, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import type { IconName } from "metabase/ui";
import { Group, Icon, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatabaseId, TableId } from "metabase-types/api";

import { NotebookCell } from "../NotebookCell";

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
  hasMetrics,
  isDisabled,
  onChange,
}: NotebookDataPickerProps) {
  const [isOpen, setIsOpen] = useState(!table);
  const store = useStore();
  const dispatch = useDispatch();
  const onChangeRef = useLatest(onChange);

  const tableInfo = useMemo(
    () => table && Lib.displayInfo(query, stageIndex, table),
    [query, stageIndex, table],
  );

  const tableValue = useMemo(
    () => table && getDataPickerValue(query, stageIndex, table),
    [query, stageIndex, table],
  );

  const getUrl = () => {
    const pickerInfo = table && Lib.pickerInfo(query, table);

    if (!pickerInfo || !tableInfo) {
      return;
    }

    const { isModel, cardId, tableId, databaseId } = pickerInfo;

    if (cardId) {
      const payload = {
        id: cardId,
        name: tableInfo.displayName,
      };

      return isModel ? Urls.model(payload) : Urls.question(payload);
    } else {
      return Urls.tableRowsQuery(databaseId, tableId);
    }
  };

  const handleChange = async (tableId: TableId) => {
    await dispatch(loadMetadataForTable(tableId));
    const metadata = getMetadata(store.getState());
    const databaseId = checkNotNull(metadata.table(tableId)).db_id;
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
    onChangeRef.current?.(table, metadataProvider);
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const isCtrlOrMetaClick =
      (event.ctrlKey || event.metaKey) && event.button === 0;
    const isMiddleClick = event.button === 1;
    const openInNewTab = (link: string) => window.open(link, "_blank");

    if (isCtrlOrMetaClick || isMiddleClick) {
      const url = getUrl();

      if (!url) {
        return;
      }

      openInNewTab(url);
    } else {
      setIsOpen(true);
    }
  };

  return (
    <>
      <UnstyledButton
        c="inherit"
        fz="inherit"
        fw="inherit"
        p={NotebookCell.CONTAINER_PADDING}
        disabled={isDisabled}
        onClick={handleClick}
      >
        <Group spacing="xs">
          {tableInfo && <Icon name={getTableIcon(tableInfo)} />}
          {tableInfo?.displayName ?? placeholder}
        </Group>
      </UnstyledButton>
      {isOpen && (
        <DataPickerModal
          title={title}
          value={tableValue}
          databaseId={databaseId}
          models={[
            "table",
            "card",
            "dataset",
            ...(hasMetrics ? ["metric" as const] : []),
          ]}
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
