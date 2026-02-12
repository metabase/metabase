import { useDisclosure } from "@mantine/hooks";

import {
  type OmniPickerItem,
  QuestionPickerModal,
} from "metabase/common/components/Pickers";
import { getQuestionPickerValue } from "metabase/common/components/Pickers/QuestionPicker";
import { Box, Button, Stack } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

type DataSourcePickerProps = {
  label: string;
  entry?: ReplaceSourceEntry;
  onChange: (entry: ReplaceSourceEntry) => void;
};

export function DataSourcePicker({
  label,
  entry,
  onChange,
}: DataSourcePickerProps) {
  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const handleChange = (item: OmniPickerItem) => {
    onChange(getSourcePickerEntry(item));
  };

  return (
    <>
      <Stack gap="sm">
        <Box>{label}</Box>
        <Button onClick={openPicker}>123</Button>
      </Stack>
      {isPickerOpen && (
        <QuestionPickerModal
          value={entry ? getCardPickerValue(entry) : undefined}
          onChange={handleChange}
          onClose={closePicker}
        />
      )}
    </>
  );
}

function getCardPickerValue(entry: ReplaceSourceEntry) {
  return getQuestionPickerValue({ id: entry.id, type: "question" });
}

function getSourcePickerEntry(item: OmniPickerItem): ReplaceSourceEntry {
  return { id: Number(item.id), type: "card" };
}
