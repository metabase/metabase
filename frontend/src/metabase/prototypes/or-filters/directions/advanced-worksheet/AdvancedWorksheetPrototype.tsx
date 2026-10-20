import { useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Popover,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import type { FilterUiProps } from "../../types";
import { Token } from "../or-pills/Token";

import { Worksheet } from "./Worksheet";
import { countFilters, isSimpleFilter, readRows, writeRows } from "./rows";

/**
 * Direction C: the whole filter is one "Advanced filter" pill that opens a
 * worksheet. Notebook mode shows the worksheet directly in the Filter step.
 */
export function AdvancedWorksheetPrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  if (variant === "chill") {
    return (
      <FilterBar query={query} stageIndex={stageIndex} onChange={onChange} />
    );
  }
  return (
    <NotebookWorksheet
      query={query}
      stageIndex={stageIndex}
      onChange={onChange}
    />
  );
}

type QueryEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

function getAdvancedFilters(query: Lib.Query, stageIndex: number) {
  return Lib.filters(query, stageIndex).filter(
    (filter) => !isSimpleFilter(query, stageIndex, filter),
  );
}

/**
 * The header's "Filter" button: picks one condition, AND-ed on as a pill. Its
 * "Advanced filter" footer turns the same popover into the worksheet.
 */
export function AdvancedWorksheetFilterButton({
  query,
  stageIndex,
  onChange,
}: FilterUiProps) {
  const [mode, setMode] = useState<"closed" | "picker" | "worksheet">("closed");
  const close = () => setMode("closed");

  return (
    <Popover
      opened={mode !== "closed"}
      position="bottom-end"
      transitionProps={{ duration: 0 }}
      onChange={(opened) => setMode(opened ? "picker" : "closed")}
    >
      <Popover.Target>
        <Button
          size="compact-md"
          variant="default"
          leftSection={<Icon name="filter" />}
          onClick={() => setMode(mode === "closed" ? "picker" : "closed")}
        >
          {t`Filter`}
        </Button>
      </Popover.Target>
      {mode === "worksheet" ? (
        <WorksheetDropdown
          query={query}
          stageIndex={stageIndex}
          filters={getAdvancedFilters(query, stageIndex)}
          onChange={onChange}
          onClose={close}
        />
      ) : (
        <Popover.Dropdown p={0}>
          <FilterPicker
            query={query}
            stageIndex={stageIndex}
            withCustomExpression={false}
            onSelect={(filterable) => {
              onChange(Lib.filter(query, stageIndex, filterable));
              close();
            }}
            onClose={close}
          />
          <Divider />
          <UnstyledButton
            w="100%"
            px="md"
            py="sm"
            ff="monospace"
            fw="bold"
            onClick={() => setMode("worksheet")}
          >
            <Group gap="sm">
              <Icon name="add" />
              {t`Advanced filter`}
            </Group>
          </UnstyledButton>
        </Popover.Dropdown>
      )}
    </Popover>
  );
}

/**
 * Single conditions show as their own pills, AND-ed without a label. Anything
 * with an OR or a group sits behind the one "Advanced filter" pill.
 */
function FilterBar({ query, stageIndex, onChange }: QueryEditorProps) {
  const filters = Lib.filters(query, stageIndex);
  const advancedFilters = getAdvancedFilters(query, stageIndex);
  const simpleFilters = filters.filter(
    (filter) => !advancedFilters.includes(filter),
  );

  return (
    <Group gap="sm" align="center">
      {filters.length === 0 && <Text c="text-secondary">{t`No filters`}</Text>}
      {advancedFilters.length > 0 && (
        <AdvancedFilterPill
          query={query}
          stageIndex={stageIndex}
          filters={advancedFilters}
          onChange={onChange}
        />
      )}
      {simpleFilters.map((filter, index) => (
        <SimplePill
          key={index}
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          onChange={onChange}
        />
      ))}
    </Group>
  );
}

type PillProps = QueryEditorProps & { filter: Lib.FilterClause };

function SimplePill({ query, stageIndex, filter, onChange }: PillProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Token
          onClick={() => setIsOpened((opened) => !opened)}
          onRemove={() => onChange(Lib.removeClause(query, stageIndex, filter))}
        >
          {getFilterLabel(query, stageIndex, filter)}
        </Token>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          onSelect={(filterable) => {
            onChange(Lib.replaceClause(query, stageIndex, filter, filterable));
            setIsOpened(false);
          }}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type AdvancedFilterPillProps = QueryEditorProps & {
  filters: Lib.FilterClause[];
};

function AdvancedFilterPill({
  query,
  stageIndex,
  filters,
  onChange,
}: AdvancedFilterPillProps) {
  const [isOpened, setIsOpened] = useState(false);
  const filterCount = countFilters(readRows(query, stageIndex, filters));

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Token
          onClick={() => setIsOpened((opened) => !opened)}
          onRemove={() => onChange(writeRows(query, stageIndex, [], filters))}
        >
          {t`Advanced filter`}
          <Text span inherit fw="normal" c="text-secondary">
            {`· ${t`${filterCount} filters`}`}
          </Text>
        </Token>
      </Popover.Target>
      {isOpened && (
        <WorksheetDropdown
          query={query}
          stageIndex={stageIndex}
          filters={filters}
          onChange={onChange}
          onClose={() => setIsOpened(false)}
        />
      )}
    </Popover>
  );
}

type WorksheetDropdownProps = AdvancedFilterPillProps & {
  onClose: () => void;
};

/**
 * Edits a draft of the grouped filters only; the plain pills are left as they
 * are. Mount it only while open, so each opening starts from the query.
 */
function WorksheetDropdown({
  query,
  stageIndex,
  filters,
  onChange,
  onClose,
}: WorksheetDropdownProps) {
  const [draft, setDraft] = useState(() =>
    readRows(query, stageIndex, filters),
  );

  return (
    // The worksheet's own pickers render inside this dropdown, so it must not clip them.
    <Popover.Dropdown p={0} style={{ overflow: "visible" }}>
      <Box miw={720}>
        <Group justify="flex-end" px="sm" pt="sm">
          <ActionIcon
            variant="subtle"
            c="text-secondary"
            aria-label={t`Close`}
            onClick={onClose}
          >
            <Icon name="close" />
          </ActionIcon>
        </Group>
        <Box px="md" pb="md">
          <Worksheet
            query={query}
            stageIndex={stageIndex}
            rows={draft}
            onChange={setDraft}
          />
        </Box>
        <Divider />
        <Group justify="flex-end" p="md">
          <Button
            variant="filled"
            onClick={() => {
              onChange(writeRows(query, stageIndex, draft, filters));
              onClose();
            }}
          >
            {t`Update filter`}
          </Button>
        </Group>
      </Box>
    </Popover.Dropdown>
  );
}

/** Edits apply straight to the query. */
function NotebookWorksheet({ query, stageIndex, onChange }: QueryEditorProps) {
  return (
    <NotebookCell color="core-filter">
      <Box
        w="100%"
        p="md"
        bg="background_surface-primary"
        style={{ borderRadius: "0.5rem" }}
      >
        <Worksheet
          query={query}
          stageIndex={stageIndex}
          rows={readRows(query, stageIndex)}
          onChange={(rows) => onChange(writeRows(query, stageIndex, rows))}
        />
      </Box>
    </NotebookCell>
  );
}
