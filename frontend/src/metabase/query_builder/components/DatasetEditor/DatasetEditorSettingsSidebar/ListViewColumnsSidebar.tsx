import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListColumns } from "metabase/list-view/components/ListView";
import {
  Button,
  type FlexProps,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { ColumnItem } from "metabase/visualizations/components/settings/ColumnItem";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

import styles from "./ListViewColumnsSidebar.module.css";

export type ListViewColumnsSidebarProps = {
  cols?: DatasetColumn[];
  settings?: ComputedVisualizationSettings | null;
  onDone?: () => void;
};

type OnDragStartHandler = FlexProps["onDragStart"];
type DragEventArg = Parameters<NonNullable<OnDragStartHandler>>[0];

/**
 * Renders a list of currently unused columns for ListViewConfiguration.
 * Items are draggable and set dataTransfer text/plain as the column "name",
 * so they can be dropped into ReorderableTagsInput fields.
 */
export function ListViewColumnsSidebar({
  cols = [],
  settings,
  onDone,
}: ListViewColumnsSidebarProps) {
  const [query, setQuery] = useState("");
  const { titleColumn, rightColumns } = useListColumns(
    cols,
    settings?.["list.columns"],
  );
  const { unusedOptions } = useMemo(() => {
    const allOptions = (cols ?? []).map((col) => ({
      value: col.name,
      label: col.display_name,
    }));

    const used = new Set<string | undefined>(
      [
        ...(titleColumn ? [titleColumn.name] : []),
        ...rightColumns.map((col) => col?.name),
      ].filter(Boolean),
    );

    const unusedOptions = allOptions.filter((opt) => !used.has(opt.value));

    return { unusedOptions };
  }, [cols, titleColumn, rightColumns]);

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
      <Group justify="space-between" align="center" h="1.5rem">
        <Text fw="bold">{t`Customize List layout`}</Text>
        <Button size="xs" variant="subtle" onClick={onDone}>{t`Done`}</Button>
      </Group>
      <Stack gap="md">
        <TextInput
          placeholder={t`Find a column...`}
          leftSection={<Icon name="search" size={14} c="text-tertiary" />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <Text mt="md">{t`Drag a column into a well to place it there.`}</Text>
        <Stack gap="sm">
          {filtered.map((opt) => (
            <ColumnItem
              key={opt.value}
              draggable
              title={opt.label}
              className={styles.listViewColumnItem}
              onDragStart={(e: DragEventArg) => {
                e?.dataTransfer?.setData("text/plain", opt.value);
              }}
            />
          ))}
          {filtered.length === 0 ? (
            <Text size="sm" c="text-tertiary">{t`No available columns`}</Text>
          ) : null}
        </Stack>
      </Stack>{" "}
    </Stack>
  );
}
