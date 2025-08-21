import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Icon, Stack, Text, TextInput } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";
import { useListColumns } from "metabase/list-view/components/ListView";

export type ListViewColumnsCustomizationProps = {
  cols?: DatasetColumn[];
  settings?: ComputedVisualizationSettings | null;
  onDone?: () => void;
};

/**
 * Renders a list of currently unused columns for the List view with drag handles.
 * Items are draggable and set dataTransfer text/plain as the column "name",
 * so they can be dropped into ReorderableTagsInput inside ListViewConfiguration.
 */
export function ListViewColumnsCustomization({
  cols = [],
  settings,
  onDone,
}: ListViewColumnsCustomizationProps) {
  const [query, setQuery] = useState("");
  const { titleColumn, subtitleColumn, rightColumns } = useListColumns(
    cols,
    settings?.viewSettings?.listSettings,
  );
  const { unusedOptions } = useMemo(() => {
    const allOptions = (cols ?? []).map((col) => ({
      value: col.name,
      label: col.display_name,
    }));

    const used = new Set<string | undefined>(
      [
        ...(titleColumn ? [titleColumn.name] : []),
        ...(subtitleColumn ? [subtitleColumn.name] : []),
        ...rightColumns.map((col) => col?.name),
      ].filter(Boolean),
    );

    const unusedOptions = allOptions.filter((opt) => !used.has(opt.value));

    return { unusedOptions };
  }, [cols, titleColumn, subtitleColumn, rightColumns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return unusedOptions;
    }
    return unusedOptions.filter(
      (opt) =>
        opt.label?.toLowerCase().includes(q) ||
        opt.value?.toLowerCase().includes(q),
    );
  }, [unusedOptions, query]);

  return (
    <Stack p="2.5rem">
      <Group justify="space-between" align="center" h="2rem">
        <Text size="md" fw="bold">{t`Customize List layout`}</Text>
        <Button size="xs" variant="subtle" onClick={onDone}>{t`Done`}</Button>
      </Group>
      <Stack gap="sm">
        <TextInput
          size="sm"
          placeholder={t`Find a column...`}
          leftSection={<Icon name="search" size={14} c="text-light" />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <Text size="xs" c="text-medium" mt="xs">
          {t`Drag a column into a well to place it there.`}
        </Text>
        <Stack gap="sm" mt="xs">
          {filtered.map((opt) => (
            <Box
              key={opt.value}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", opt.value);
              }}
              p="sm"
              style={{
                border: "1px solid var(--mb-color-border)",
                borderRadius: "var(--mantine-radius-sm)",
                background: "var(--mb-color-background)",
                cursor: "grab",
              }}
            >
              <Group
                wrap="nowrap"
                gap="sm"
                align="center"
                justify="space-between"
              >
                <Text size="sm">{opt.label}</Text>
                <Icon name="grabber" size={14} c="text-medium" />
              </Group>
            </Box>
          ))}
          {filtered.length === 0 ? (
            <Text size="sm" c="text-light">{t`No available columns`}</Text>
          ) : null}
        </Stack>
      </Stack>{" "}
    </Stack>
  );
}
