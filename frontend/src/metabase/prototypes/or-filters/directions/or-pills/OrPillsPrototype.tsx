import { useState } from "react";
import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "metabase/querying/notebook/components/NotebookCell";
import { Button, Group, Icon, Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import type { FilterUiProps, FilterUiVariant } from "../../types";

import { GroupEditor } from "./GroupEditor";
import { type PillRows, readPillRows, writePillRows } from "./orPills";

/**
 * Direction A: top-level filters stay AND-ed pills, as today. A pill can hold
 * OR rows, edited in the group-editor dropdown.
 */
export function OrPillsPrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  const filters = Lib.filters(query, stageIndex);

  const pills = filters.map((filter, index) => (
    <Pill
      key={index}
      query={query}
      stageIndex={stageIndex}
      variant={variant}
      filter={filter}
      onUpdate={(rows) =>
        onChange(writePillRows(query, stageIndex, filter, rows))
      }
      onRemove={() => onChange(Lib.removeClause(query, stageIndex, filter))}
    />
  ));

  const addButton = (
    <AddFilterPopover
      query={query}
      stageIndex={stageIndex}
      variant={variant}
      isFirst={filters.length === 0}
      onAdd={(filterable) =>
        onChange(Lib.filter(query, stageIndex, filterable))
      }
    />
  );

  if (variant === "chill") {
    return (
      <Group gap="sm" align="center">
        {pills}
        {addButton}
      </Group>
    );
  }

  return (
    <NotebookCell color="core-filter">
      {pills}
      {addButton}
    </NotebookCell>
  );
}

type PillProps = {
  query: Lib.Query;
  stageIndex: number;
  variant: FilterUiVariant;
  filter: Lib.FilterClause;
  onUpdate: (rows: PillRows) => void;
  onRemove: () => void;
};

function Pill({
  query,
  stageIndex,
  variant,
  filter,
  onUpdate,
  onRemove,
}: PillProps) {
  const [isOpened, setIsOpened] = useState(false);
  const rows = readPillRows(query, stageIndex, filter);
  const label = getPillLabel(query, stageIndex, rows);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        {variant === "chill" ? (
          <FilterPill
            onClick={() => setIsOpened((opened) => !opened)}
            onRemoveClick={onRemove}
          >
            {label}
          </FilterPill>
        ) : (
          <NotebookCellItem
            color="core-filter"
            onClick={() => setIsOpened((opened) => !opened)}
          >
            {label}
            <Icon
              name="close"
              ml="sm"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
            />
          </NotebookCellItem>
        )}
      </Popover.Target>
      {/* The editor's own pickers render inside this dropdown, so it must not clip them. */}
      <Popover.Dropdown p={0} style={{ overflow: "visible" }}>
        <GroupEditor
          query={query}
          stageIndex={stageIndex}
          rows={rows}
          onUpdate={(nextRows) => {
            onUpdate(nextRows);
            setIsOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/** `(A and B) or C`, with parentheses only when a row needs them. */
function getPillLabel(
  query: Lib.Query,
  stageIndex: number,
  rows: PillRows,
): string {
  return rows
    .map((row) => {
      const rowLabel = row
        .map((clause) => getFilterLabel(query, stageIndex, clause))
        .join(` ${t`and`} `);
      return row.length > 1 && rows.length > 1 ? `(${rowLabel})` : rowLabel;
    })
    .join(` ${t`or`} `);
}

type AddFilterPopoverProps = {
  query: Lib.Query;
  stageIndex: number;
  variant: FilterUiVariant;
  isFirst: boolean;
  onAdd: (filterable: Lib.Filterable) => void;
};

function AddFilterPopover({
  query,
  stageIndex,
  variant,
  isFirst,
  onAdd,
}: AddFilterPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        {variant === "chill" ? (
          <Group gap="sm">
            {isFirst && <Text c="text-secondary">{t`No filters`}</Text>}
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<Icon name="add" />}
              onClick={() => setIsOpened((opened) => !opened)}
            >
              {t`Add filter`}
            </Button>
          </Group>
        ) : (
          <NotebookCellAdd
            color="core-filter"
            initialAddText={
              isFirst ? t`Add filters to narrow your answer` : undefined
            }
            onClick={() => setIsOpened((opened) => !opened)}
          />
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          onSelect={(filterable) => {
            onAdd(filterable);
            setIsOpened(false);
          }}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
