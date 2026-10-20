import { useRef, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { Box, Button, Divider, Group, Icon, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";

import S from "./GroupEditor.module.css";
import { Token } from "./Token";
import { type PillRows, updateRow } from "./orPills";

type GroupEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  rows: PillRows;
  onUpdate: (rows: PillRows) => void;
  /** Ungroups the pill: each row becomes its own top-level filter. */
  onExpand: (rows: PillRows) => void;
};

/**
 * The dropdown for one pill. A pill holding a single standard filter shows the
 * plain filter picker with an "Or…" button (Figma "Filter popover"); anything
 * else shows rows of AND-ed tokens joined by OR (Figma "Group editor"), edited
 * as a draft and written back on "Update filter".
 */
export function GroupEditor({
  query,
  stageIndex,
  rows: initialRows,
  onUpdate,
  onExpand,
}: GroupEditorProps) {
  const [rows, setRows] = useState(initialRows);
  // Only one thing is ever on screen: the single-clause editor, the rows, or
  // the picker that adds/replaces one clause (no picker stacked over the rows).
  const [view, setView] = useState<EditorView>({ type: "auto" });

  const singleClause =
    view.type === "auto"
      ? getSingleStandardClause(query, stageIndex, rows)
      : undefined;
  if (singleClause) {
    return (
      <SingleClauseEditor
        query={query}
        stageIndex={stageIndex}
        clause={singleClause.clause}
        column={singleClause.column}
        onOr={() => setView({ type: "add", rowIndex: rows.length })}
        onUpdate={(clause) => onUpdate([[clause]])}
      />
    );
  }

  const handleAdd = (rowIndex: number, filterable: Lib.Filterable) => {
    const clause = toFilterClause(query, stageIndex, filterable);
    setRows(
      rowIndex === rows.length
        ? [...rows, [clause]]
        : updateRow(rows, rowIndex, (row) => [...row, clause]),
    );
    setView({ type: "rows" });
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
    setView({ type: "rows" });
  };

  if (view.type === "add") {
    return (
      <FilterPicker
        query={query}
        stageIndex={stageIndex}
        onSelect={(filterable) => handleAdd(view.rowIndex, filterable)}
        onClose={() => setView({ type: "rows" })}
      />
    );
  }

  if (view.type === "replace") {
    return (
      <FilterPicker
        query={query}
        stageIndex={stageIndex}
        filter={view.clause}
        onSelect={(filterable) =>
          handleReplace(view.rowIndex, view.clause, filterable)
        }
        onClose={() => setView({ type: "rows" })}
      />
    );
  }

  const handleRemove = (rowIndex: number, clause: Lib.FilterClause) => {
    setRows(
      updateRow(rows, rowIndex, (row) =>
        row.filter((member) => member !== clause),
      ),
    );
  };

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
                <Token
                  key={clauseIndex}
                  onClick={() => setView({ type: "replace", rowIndex, clause })}
                  onRemove={() => handleRemove(rowIndex, clause)}
                >
                  {getFilterLabel(query, stageIndex, clause)}
                </Token>,
              ])}
              <AddButton
                label={t`and`}
                className={S.rowAdd}
                onClick={() => setView({ type: "add", rowIndex })}
              />
            </Group>
          ))}
        </Stack>
        <Box>
          <AddButton
            label={t`or`}
            fw="bold"
            onClick={() => setView({ type: "add", rowIndex: rows.length })}
          />
        </Box>
      </Stack>
      <Divider />
      <Group justify="space-between" p="md">
        <Button
          variant="subtle"
          size="compact-md"
          px={0}
          // Changes the logic: OR rows become AND-ed top-level pills.
          onClick={() => onExpand(rows)}
        >
          {t`Expand`}
        </Button>
        <Button variant="filled" onClick={() => onUpdate(rows)}>
          {t`Update filter`}
        </Button>
      </Group>
    </Box>
  );
}

type SingleStandardClause = {
  clause: Lib.FilterClause;
  column: Lib.ColumnMetadata;
};

function getSingleStandardClause(
  query: Lib.Query,
  stageIndex: number,
  rows: PillRows,
): SingleStandardClause | undefined {
  const [firstRow = [], ...otherRows] = rows;
  const [clause, ...otherClauses] = firstRow;
  if (clause == null || otherRows.length > 0 || otherClauses.length > 0) {
    return undefined;
  }
  const column = Lib.filterParts(query, stageIndex, clause)?.column;
  return column ? { clause, column } : undefined;
}

type SingleClauseEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  column: Lib.ColumnMetadata;
  onOr: () => void;
  onUpdate: (clause: Lib.FilterClause) => void;
};

/** Figma "Filter popover": the real picker body with "Or…" next to "Update filter". */
function SingleClauseEditor({
  query,
  stageIndex,
  clause,
  column,
  onOr,
  onUpdate,
}: SingleClauseEditorProps) {
  const [isPickingColumn, setIsPickingColumn] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const handleChange = (filterable: Lib.Filterable) => {
    onUpdate(toFilterClause(query, stageIndex, filterable));
  };

  if (isPickingColumn) {
    return (
      <FilterPicker
        query={query}
        stageIndex={stageIndex}
        onSelect={handleChange}
        onClose={() => setIsPickingColumn(false)}
      />
    );
  }

  return (
    <Box ref={bodyRef}>
      <FilterPickerBody
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={clause}
        isNew={false}
        withSubmitButton={false}
        onChange={handleChange}
        onBack={() => setIsPickingColumn(true)}
      />
      <Divider />
      <Group justify="space-between" p="md" ff="monospace">
        <Button variant="default" onClick={onOr}>
          {t`Or…`}
        </Button>
        <Button
          variant="filled"
          // The picker body commits on form submit; its own submit button is hidden.
          onClick={() =>
            bodyRef.current?.querySelector("form")?.requestSubmit()
          }
        >
          {t`Update filter`}
        </Button>
      </Group>
    </Box>
  );
}

type EditorView =
  | { type: "auto" }
  | { type: "rows" }
  | { type: "add"; rowIndex: number }
  | { type: "replace"; rowIndex: number; clause: Lib.FilterClause };

type AddButtonProps = {
  label: string;
  className?: string;
  fw?: "bold";
  onClick: () => void;
};

function AddButton({ label, className, fw, onClick }: AddButtonProps) {
  return (
    <Button
      size="compact-md"
      variant="subtle"
      c="text-secondary"
      fw={fw ?? "normal"}
      className={className}
      leftSection={<Icon name="add" />}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
