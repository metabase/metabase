import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import {
  DataPickerModal,
  type DataPickerValue,
} from "metabase/common/components/Pickers/DataPicker";
import { Button, FixedSizeIcon } from "metabase/ui";
import { useGetDependencyNodeQuery } from "metabase-enterprise/api";
import type { DependencyEntry, TableId } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../utils";

import { getDataPickerValue, getDependencyEntry } from "./utils";

const PICKER_MODELS: DataPickerValue["model"][] = [
  "table",
  "card",
  "dataset",
  "metric",
];

type NodePickerProps = {
  entry: DependencyEntry | undefined;
  onEntryChange: (entry: DependencyEntry) => void;
};

export function NodePicker({ entry, onEntryChange }: NodePickerProps) {
  const { data: node } = useGetDependencyNodeQuery(
    entry != null ? entry : skipToken,
  );
  const [isOpened, { open, close }] = useDisclosure();

  const handleChange = (tableId: TableId) => {
    onEntryChange(getDependencyEntry(tableId));
  };

  return (
    <>
      <Button
        variant={node ? "default" : "filled"}
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
