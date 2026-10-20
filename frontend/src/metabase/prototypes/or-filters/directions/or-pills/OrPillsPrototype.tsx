import { Fragment, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  NotebookCell,
  NotebookCellAdd,
} from "metabase/querying/notebook/components/NotebookCell";
import { Button, Group, Icon, Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import type { FilterUiProps, FilterUiVariant } from "../../types";

import { GroupEditor, getOperatorLabel } from "./GroupEditor";
import { Token } from "./Token";
import {
  type PillTree,
  expandPillTree,
  flattenPillTree,
  readPillTree,
  writePillTree,
} from "./orPills";

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
      filter={filter}
      onUpdate={(tree) =>
        onChange(writePillTree(query, stageIndex, filter, tree))
      }
      onExpand={(tree) =>
        onChange(expandPillTree(query, stageIndex, filter, tree))
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
  filter: Lib.FilterClause;
  onUpdate: (tree: PillTree) => void;
  onExpand: (tree: PillTree) => void;
  onRemove: () => void;
};

function Pill({
  query,
  stageIndex,
  filter,
  onUpdate,
  onExpand,
  onRemove,
}: PillProps) {
  const [isOpened, setIsOpened] = useState(false);
  const tree = readPillTree(query, stageIndex, filter);

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
          onRemove={onRemove}
        >
          <PillLabel query={query} stageIndex={stageIndex} tree={tree} />
        </Token>
      </Popover.Target>
      {/* The editor's own pickers render inside this dropdown, so it must not clip them. */}
      <Popover.Dropdown p={0} style={{ overflow: "visible" }}>
        <GroupEditor
          query={query}
          stageIndex={stageIndex}
          tree={tree}
          onUpdate={(nextTree) => {
            onUpdate(nextTree);
            setIsOpened(false);
          }}
          onExpand={(nextTree) => {
            onExpand(nextTree);
            setIsOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type PillLabelProps = {
  query: Lib.Query;
  stageIndex: number;
  tree: PillTree;
};

const MAX_FULL_LABEL_CLAUSES = 2;

/**
 * Figma "Group token (collapsed)": up to two conditions are spelled out;
 * three or more collapse to the first condition and `and|or N more`.
 */
function PillLabel({ query, stageIndex, tree }: PillLabelProps) {
  const parts = flattenPillTree(tree).map(({ connector, clause }) => ({
    connector: getOperatorLabel(connector),
    label: getFilterLabel(query, stageIndex, clause),
  }));
  const [first, ...rest] = parts;
  if (!first) {
    return null;
  }

  const isSummarized = parts.length > MAX_FULL_LABEL_CLAUSES;
  const tail = isSummarized
    ? [{ connector: rest[0].connector, label: t`${rest.length} more` }]
    : rest;

  return (
    <>
      {first.label}
      {tail.map(({ connector, label }, index) => (
        <Fragment key={index}>
          <Text span inherit fw="normal" c="text-secondary">
            {connector}
          </Text>
          {label}
        </Fragment>
      ))}
    </>
  );
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
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={isFirst ? <Icon name="add" /> : undefined}
              onClick={() => setIsOpened((opened) => !opened)}
            >
              {isFirst ? t`Add filter` : t`AND`}
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
