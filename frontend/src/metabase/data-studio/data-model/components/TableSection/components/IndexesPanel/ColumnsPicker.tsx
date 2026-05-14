import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";
import { t } from "ttag";

import {
  type DragEndEvent,
  Sortable,
  SortableList,
} from "metabase/common/components/Sortable";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import type { Field } from "metabase-types/api";

import S from "./ColumnsPicker.module.css";
import { DIRECTIONS, type IndexFormColumn } from "./types";
import { nextColumnId } from "./utils";

interface Props {
  fields: Field[];
  columns: IndexFormColumn[];
  onChange: (columns: IndexFormColumn[]) => void;
}

export function ColumnsPicker({ fields, columns, onChange }: Props) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });

  const usedNames = useMemo(
    () => new Set(columns.map((c) => c.name)),
    [columns],
  );

  const availableFields = useMemo(
    () => fields.filter((field) => !usedNames.has(field.name)),
    [fields, usedNames],
  );

  const fieldByName = useMemo(() => {
    const map = new Map<string, Field>();
    for (const field of fields) {
      map.set(field.name, field);
    }
    return map;
  }, [fields]);

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    const byId = new Map(columns.map((c) => [c.id, c]));
    onChange(
      itemIds
        .map((id) => byId.get(String(id)))
        .filter((c): c is IndexFormColumn => c != null),
    );
  };

  const updateColumn = (id: string, patch: Partial<IndexFormColumn>) => {
    onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeColumn = (id: string) => {
    onChange(columns.filter((c) => c.id !== id));
  };

  const addColumn = (name: string | null) => {
    if (!name) {
      return;
    }
    onChange([
      ...columns,
      { id: nextColumnId(), name, direction: "asc" },
    ]);
  };

  const addOptions = availableFields.map((field) => ({
    value: field.name,
    label: field.display_name || field.name,
  }));

  return (
    <Stack gap="sm">
      <SortableList<IndexFormColumn>
        items={columns}
        sensors={[pointerSensor]}
        getId={(item) => item.id}
        onSortEnd={handleSortEnd}
        renderItem={({ item, index }) => (
          <Sortable id={item.id} disabled={columns.length <= 1}>
            <Box className={S.row} mb="xs">
              <span
                className={S.grip}
                aria-hidden
                data-testid="column-drag-handle"
              >
                <Icon name="grabber" size={14} />
              </span>
              <span className={S.position} aria-hidden>
                {index + 1}
              </span>
              <span className={S.label}>
                {fieldByName.get(item.name)?.display_name ?? item.name}
              </span>
              <Box className={S.direction}>
                <Select
                  size="xs"
                  value={item.direction ?? "asc"}
                  data={DIRECTIONS.map((d) => ({
                    value: d.value,
                    label: d.label,
                  }))}
                  onChange={(value) => {
                    if (value === "asc" || value === "desc") {
                      updateColumn(item.id, { direction: value });
                    }
                  }}
                  allowDeselect={false}
                />
              </Box>
              <ActionIcon
                variant="subtle"
                color="text-secondary"
                size="sm"
                aria-label={t`Remove column`}
                onClick={() => removeColumn(item.id)}
              >
                <Icon name="close" size={14} />
              </ActionIcon>
            </Box>
          </Sortable>
        )}
      />

      {addOptions.length > 0 ? (
        <Box className={S.searchWrap}>
          <Select
            data={addOptions}
            searchable
            value={null}
            placeholder={t`Search columns`}
            leftSection={<Icon name="search" size={14} />}
            onChange={addColumn}
            comboboxProps={{ withinPortal: true }}
          />
        </Box>
      ) : (
        <Text c="text-secondary" size="sm">
          {t`All columns have been added.`}
        </Text>
      )}

      {columns.length === 0 && (
        <Group gap="xs" c="text-secondary">
          <Icon name="info" size={14} />
          <Text size="sm">{t`Add at least one column to define the index.`}</Text>
        </Group>
      )}

      <Text c="text-secondary" size="xs">
        {t`Column order matters for composite indexes.`}
      </Text>
    </Stack>
  );
}
