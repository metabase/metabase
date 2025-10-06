import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useLazyGetCardQuery } from "metabase/api";
import {
  DataPickerModal,
  type DataPickerValue,
} from "metabase/common/components/Pickers/DataPicker";
import { Button, FixedSizeIcon } from "metabase/ui";
import type {
  DependencyEntry,
  DependencyGraph,
  TableId,
} from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../utils";

import { findNode, getDataPickerValue, getDependencyEntry } from "./utils";

const PICKER_MODELS: DataPickerValue["model"][] = [
  "table",
  "card",
  "dataset",
  "metric",
];

type EntryNodePickerProps = {
  entry: DependencyEntry | undefined;
  graph: DependencyGraph | undefined;
  isFetching: boolean;
  onEntryChange: (entry: DependencyEntry) => void;
};

export function EntryNodePicker({
  entry,
  graph,
  isFetching,
  onEntryChange,
}: EntryNodePickerProps) {
  const node =
    graph != null && entry != null ? findNode(graph, entry) : undefined;
  const [isOpened, { open, close }] = useDisclosure();
  const [fetchCard] = useLazyGetCardQuery();

  const handleChange = async (tableId: TableId) => {
    const newEntry = await getDependencyEntry(tableId, (cardId) =>
      fetchCard({ id: cardId }).unwrap(),
    );
    onEntryChange(newEntry);
  };

  return (
    <>
      <Button
        variant={node ? "default" : "filled"}
        loading={isFetching}
        leftSection={node ? <FixedSizeIcon name={getNodeIcon(node)} /> : null}
        onClick={open}
      >
        {node ? getNodeLabel(node) : t`Pick your starting data`}
      </Button>
      {isOpened && (
        <DataPickerModal
          title={t`Pick your starting data`}
          value={node ? getDataPickerValue(node) : undefined}
          models={PICKER_MODELS}
          onChange={handleChange}
          onClose={close}
        />
      )}
    </>
  );
}
