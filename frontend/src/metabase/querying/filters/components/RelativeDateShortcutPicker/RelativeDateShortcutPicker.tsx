import { isMatching } from "ts-pattern";

import type { RelativeDatePickerValue } from "metabase/querying/filters/types";
import { Button, Divider, SimpleGrid, Stack, Title } from "metabase/ui";

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
    <Stack p="md" spacing="md">
      {groups.map((group, groupIndex) => (
        <section key={groupIndex}>
          {group.label && (
            <Divider
              label={
                <Title order={3} fz="xs">
                  {group.label}
                </Title>
              }
              labelPosition="center"
              mb="sm"
            />
          )}
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
        </section>
      ))}
    </Stack>
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
      fw="normal"
      aria-selected={isSelected}
      onClick={() => onChange(shortcut.value)}
    >
      {shortcut.label}
    </Button>
  );
}
