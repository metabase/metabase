import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  Badge,
  Box,
  Button,
  Group,
  Icon,
  Popover,
  Select,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";

import type { SuggestedTableRow, SuggestedTablesFilters } from "./types";

export const EMPTY_FILTERS: SuggestedTablesFilters = {
  databaseId: null,
  schemaName: null,
};

type SuggestedTablesFilterProps = {
  rows: SuggestedTableRow[];
  filters: SuggestedTablesFilters;
  onChange: (filters: SuggestedTablesFilters) => void;
};

/** Filter button that narrows suggestions to a database and schema */
export function SuggestedTablesFilter({
  rows,
  filters,
  onChange,
}: SuggestedTablesFilterProps) {
  const [isOpen, { toggle, close }] = useDisclosure(false);
  const isFiltered = filters.databaseId != null || filters.schemaName != null;

  return (
    <Popover
      width={rem(340)}
      position="bottom-end"
      opened={isOpen}
      onChange={toggle}
    >
      <Popover.Target>
        <Tooltip label={t`Filter`} disabled={isOpen}>
          <Button
            aria-label={t`Filter`}
            leftSection={
              <Box pos="relative">
                <Icon name="filter" />
                {isFiltered && (
                  <Badge
                    color="brand"
                    indicator
                    pos="absolute"
                    top={-6}
                    right={-8}
                  />
                )}
              </Box>
            }
            size="lg"
            onClick={toggle}
          />
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterForm
          rows={rows}
          filters={filters}
          onSubmit={(newFilters) => {
            onChange(newFilters);
            close();
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type FilterFormProps = {
  rows: SuggestedTableRow[];
  filters: SuggestedTablesFilters;
  onSubmit: (filters: SuggestedTablesFilters) => void;
};

function FilterForm({ rows, filters, onSubmit }: FilterFormProps) {
  const [form, setForm] = useState(filters);

  const databaseOptions = useMemo(
    () =>
      _.uniq(rows, false, (row) => row.table.db_id)
        .map((row) => ({
          value: String(row.table.db_id),
          label: row.databaseName,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rows],
  );

  // Schemas of the chosen database, or of every database when none is chosen
  const schemaOptions = useMemo(
    () =>
      _.uniq(
        rows.filter(
          (row) =>
            form.databaseId == null || row.table.db_id === form.databaseId,
        ),
        false,
        (row) => row.table.schema,
      )
        .map((row) => ({ value: row.table.schema, label: row.schemaName }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rows, form.databaseId],
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <Stack gap="xxl" p="xl">
        <Select
          label={t`Database`}
          placeholder={t`Any database`}
          clearable
          data={databaseOptions}
          value={form.databaseId != null ? String(form.databaseId) : null}
          onChange={(value) =>
            setForm({
              databaseId: value != null ? Number(value) : null,
              schemaName: null,
            })
          }
          comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
        />
        <Select
          label={t`Schema`}
          placeholder={t`Any schema`}
          clearable
          data={schemaOptions}
          value={form.schemaName}
          onChange={(schemaName) => setForm({ ...form, schemaName })}
          comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
        />
        <Group justify="space-between" wrap="nowrap">
          <Button
            flex={1}
            onClick={() => onSubmit(EMPTY_FILTERS)}
          >{t`Clear filters`}</Button>
          <Button flex={1} variant="filled" type="submit">
            {t`Apply`}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
