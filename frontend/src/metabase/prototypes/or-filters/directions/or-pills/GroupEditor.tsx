import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
} from "metabase/ui";
import type * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";

import S from "./GroupEditor.module.css";
import { Token } from "./Token";
import { type PillRows, toPillClause, updateRow } from "./orPills";

type GroupEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  rows: PillRows;
  onUpdate: (rows: PillRows) => void;
};

/**
 * The dropdown for one pill (Figma "Group editor"): rows of AND-ed tokens
 * joined by OR, edited as a draft and written back on "Update filter".
 */
export function GroupEditor({
  query,
  stageIndex,
  rows: initialRows,
  onUpdate,
}: GroupEditorProps) {
  const [rows, setRows] = useState(initialRows);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAdd = (rowIndex: number, filterable: Lib.Filterable) => {
    const clause = toFilterClause(query, stageIndex, filterable);
    setRows(
      rowIndex === rows.length
        ? [...rows, [clause]]
        : updateRow(rows, rowIndex, (row) => [...row, clause]),
    );
  };

  const handleReplace = (
    rowIndex: number,
    clause: Lib.FilterClause,
    filterable: Lib.Filterable,
  ) => {
    const nextClause = toFilterClause(query, stageIndex, filterable);
    setRows(
      updateRow(rows, rowIndex, (row) =>
        row.map((member) => (member === clause ? nextClause : member)),
      ),
    );
  };

  const handleRemove = (rowIndex: number, clause: Lib.FilterClause) => {
    setRows(
      updateRow(rows, rowIndex, (row) =>
        row.filter((member) => member !== clause),
      ),
    );
  };

  const draftClause = toPillClause(rows);

  return (
    <Box miw={420} ff="monospace">
      <Stack gap="sm" px="md" pt="sm" pb="md">
        <Stack gap="xs">
          {rows.map((row, rowIndex) => (
            <Group key={rowIndex} gap="xs" wrap="wrap" className={S.row}>
              <Icon name="grabber" c="text-secondary" />
              <Text w={52} c="text-secondary">
                {rowIndex === 0 ? t`Where` : t`or`}
              </Text>
              {row.flatMap((clause, clauseIndex) => [
                clauseIndex > 0 && (
                  <Text key={`and-${clauseIndex}`} c="text-secondary">
                    {t`and`}
                  </Text>
                ),
                <ClauseToken
                  key={clauseIndex}
                  query={query}
                  stageIndex={stageIndex}
                  clause={clause}
                  onReplace={(filterable) =>
                    handleReplace(rowIndex, clause, filterable)
                  }
                  onRemove={() => handleRemove(rowIndex, clause)}
                />,
              ])}
              <AddButton
                query={query}
                stageIndex={stageIndex}
                label={t`and`}
                className={S.rowAdd}
                onAdd={(filterable) => handleAdd(rowIndex, filterable)}
              />
            </Group>
          ))}
        </Stack>
        <Box>
          <AddButton
            query={query}
            stageIndex={stageIndex}
            label={t`or`}
            fw="bold"
            onAdd={(filterable) => handleAdd(rows.length, filterable)}
          />
        </Box>
        {isExpanded && (
          <Text size="sm" c="text-secondary">
            {draftClause
              ? getFilterLabel(
                  query,
                  stageIndex,
                  toFilterClause(query, stageIndex, draftClause),
                )
              : t`No conditions`}
          </Text>
        )}
      </Stack>
      <Divider />
      <Group justify="space-between" p="md">
        <Button
          variant="subtle"
          size="compact-md"
          px={0}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          {isExpanded ? t`Collapse` : t`Expand`}
        </Button>
        <Button variant="filled" onClick={() => onUpdate(rows)}>
          {t`Update filter`}
        </Button>
      </Group>
    </Box>
  );
}

type ClauseTokenProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  onReplace: (filterable: Lib.Filterable) => void;
  onRemove: () => void;
};

function ClauseToken({
  query,
  stageIndex,
  clause,
  onReplace,
  onRemove,
}: ClauseTokenProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      // Rendered inside the editor's dropdown, so clicking the picker is not
      // an outside click for the editor's own popover.
      withinPortal={false}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Token
          onClick={() => setIsOpened((opened) => !opened)}
          onRemove={onRemove}
        >
          {getFilterLabel(query, stageIndex, clause)}
        </Token>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={clause}
          onSelect={(filterable) => {
            onReplace(filterable);
            setIsOpened(false);
          }}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type AddButtonProps = {
  query: Lib.Query;
  stageIndex: number;
  label: string;
  className?: string;
  fw?: "bold";
  onAdd: (filterable: Lib.Filterable) => void;
};

function AddButton({
  query,
  stageIndex,
  label,
  className,
  fw,
  onAdd,
}: AddButtonProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      // Rendered inside the editor's dropdown, so clicking the picker is not
      // an outside click for the editor's own popover.
      withinPortal={false}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Button
          size="compact-md"
          variant="subtle"
          c="text-secondary"
          fw={fw ?? "normal"}
          className={cx(className)}
          data-opened={isOpened}
          leftSection={<Icon name="add" />}
          onClick={() => setIsOpened((opened) => !opened)}
        >
          {label}
        </Button>
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
