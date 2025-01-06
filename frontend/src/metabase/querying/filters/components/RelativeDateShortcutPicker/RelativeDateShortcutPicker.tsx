import { isMatching } from "ts-pattern";

import type { RelativeDatePickerValue } from "metabase/querying/filters/types";
import { Box, Button, Divider, SimpleGrid } from "metabase/ui";

import type { Shortcut } from "./types";
import { getShortcutGroups } from "./utils";

type RelativeDateShortcutPickerProps = {
  value?: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
};

export function RelativeDateShortcutPicker({
  value,
  onChange,
}: RelativeDateShortcutPickerProps) {
  const groups = getShortcutGroups();

  return (
    <Box>
      {groups.map((group, groupIndex) => (
        <div key={groupIndex}>
          {group.label && <Divider label={group.label} />}
          <SimpleGrid cols={group.columns}>
            {group.shortcuts.map((shortcut, shortcutIndex) => (
              <ShortcutButton
                key={shortcutIndex}
                value={value}
                shortcut={shortcut}
                onChange={onChange}
              />
            ))}
          </SimpleGrid>
        </div>
      ))}
    </Box>
  );
}

type ShortcutButtonProps = {
  value: RelativeDatePickerValue | undefined;
  shortcut: Shortcut;
  onChange: (value: RelativeDatePickerValue) => void;
};

function ShortcutButton({ value, shortcut, onChange }: ShortcutButtonProps) {
  const isSelected = isMatching({ ...shortcut.value }, value);

  return (
    <Button
      variant={isSelected ? "filled" : "default"}
      onClick={() => onChange(shortcut.value)}
    >
      {shortcut.label}
    </Button>
  );
}
