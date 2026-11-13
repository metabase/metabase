import { Fragment, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import {
  Box,
  Button,
  Group,
  Icon,
  Menu,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";
import type { FilterUiProps } from "../../types";
import { Token } from "../or-pills/Token";

import S from "./QbeGrid.module.css";
import {
  type Grid,
  type GridColumn,
  addColumn,
  addRow,
  columnKey,
  duplicateRow,
  readGrid,
  removeColumn,
  removeRow,
  setCell,
  writeGrid,
} from "./qbe";

type CellTarget = { rowIndex: number; column: GridColumn };
type AnchorRect = { left: number; top: number; width: number; height: number };

/**
 * Direction D: a query-by-example grid. Columns are data columns, rows are
 * segments joined by OR, cells on a row are AND-ed. Build a second segment by
 * duplicating a row and changing a cell.
 */
export function QbeGridPrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  const grid = useGridState(query, stageIndex, onChange);

  const content = (
    <Stack gap="sm" w="100%" miw={0}>
      <StripSummary query={query} stageIndex={stageIndex} grid={grid.value} />
      <GridEditor
        query={query}
        stageIndex={stageIndex}
        grid={grid.value}
        onCommit={grid.commit}
      />
    </Stack>
  );

  return variant === "chill" ? (
    content
  ) : (
    <NotebookCell color="core-filter">{content}</NotebookCell>
  );
}

/**
 * Empty columns and rows have no clause to live in the query, so the grid is
 * local state. It is re-read only when the query changes from outside, not
 * when it comes back from our own write.
 */
function useGridState(
  query: Lib.Query,
  stageIndex: number,
  onChange: (query: Lib.Query) => void,
) {
  const [value, setValue] = useState(() => readGrid(query, stageIndex));
  const writtenQuery = useRef<Lib.Query>();

  useEffect(() => {
    if (query !== writtenQuery.current) {
      setValue(readGrid(query, stageIndex));
    }
  }, [query, stageIndex]);

  const commit = (next: Grid) => {
    setValue(next);
    const nextQuery = writeGrid(query, stageIndex, next);
    writtenQuery.current = nextQuery;
    onChange(nextQuery);
  };

  return { value, commit };
}

type GridProps = {
  query: Lib.Query;
  stageIndex: number;
  grid: Grid;
};

/** How the grid reads in the filter bar: pill groups joined by "or". */
function StripSummary({ query, stageIndex, grid }: GridProps) {
  const rows = grid.rows.filter((row) => row.size > 0);
  if (rows.length === 0) {
    return <Text c="text-secondary">{t`No filters`}</Text>;
  }
  return (
    <Group gap="sm" align="center">
      {rows.map((row, rowIndex) => (
        <Fragment key={rowIndex}>
          {rowIndex > 0 && (
            <Text c="text-secondary" fs="italic">
              {t`or`}
            </Text>
          )}
          {[...row.entries()].map(([key, clause]) => (
            <Token
              key={key}
              onClick={() => undefined}
              onRemove={() => undefined}
            >
              {getFilterLabel(query, stageIndex, clause)}
            </Token>
          ))}
        </Fragment>
      ))}
    </Group>
  );
}

type GridEditorProps = GridProps & { onCommit: (grid: Grid) => void };

function GridEditor({ query, stageIndex, grid, onCommit }: GridEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cell, setOpenCell] = useState<{
    target: CellTarget;
    anchor: AnchorRect;
  }>();
  const [isColumnPickerOpened, setIsColumnPickerOpened] = useState(false);

  const openCell = (target: CellTarget, element: Element) => {
    const container = containerRef.current?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setOpenCell({
      target,
      anchor: {
        left: rect.left - (container?.left ?? 0),
        top: rect.top - (container?.top ?? 0),
        width: rect.width,
        height: rect.height,
      },
    });
  };

  const commitCell = (target: CellTarget, filterable: Lib.Filterable) => {
    const clause = toFilterClause(query, stageIndex, filterable);
    onCommit(setCell(grid, target.rowIndex, target.column.key, clause));
    setOpenCell(undefined);
  };

  const usedKeys = new Set(grid.columns.map((column) => column.key));
  const availableColumns = Lib.filterableColumns(query, stageIndex)
    .map((column) => ({ key: columnKey(query, stageIndex, column), column }))
    .filter((column) => !usedKeys.has(column.key));

  const openClause = cell
    ? grid.rows[cell.target.rowIndex]?.get(cell.target.column.key)
    : undefined;

  return (
    <Box ref={containerRef} pos="relative">
      <table className={S.table}>
        <thead>
          <tr>
            <th />
            {grid.columns.map((column) => (
              <th key={column.key}>
                <Group gap="xs" wrap="nowrap">
                  {column.key}
                  <Icon
                    name="close"
                    size={10}
                    c="text-secondary"
                    cursor="pointer"
                    aria-label={t`Remove column`}
                    onClick={() => onCommit(removeColumn(grid, column.key))}
                  />
                </Group>
              </th>
            ))}
            <th>
              <Menu
                opened={isColumnPickerOpened}
                position="bottom-start"
                shadow="md"
                onChange={setIsColumnPickerOpened}
              >
                <Menu.Target>
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    c="text-secondary"
                    tt="none"
                    leftSection={<Icon name="add" />}
                    onClick={() => setIsColumnPickerOpened((opened) => !opened)}
                  >
                    {t`column`}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown miw={240}>
                  <Menu.Label>{t`Add a column`}</Menu.Label>
                  <ScrollArea.Autosize mah={320} type="auto">
                    {availableColumns.map((column) => (
                      <Menu.Item
                        key={column.key}
                        leftSection={
                          <Icon name={getColumnIcon(column.column)} size={14} />
                        }
                        onClick={() => onCommit(addColumn(grid, column))}
                      >
                        {column.key}
                      </Menu.Item>
                    ))}
                  </ScrollArea.Autosize>
                </Menu.Dropdown>
              </Menu>
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className={S.lead} data-first={rowIndex === 0}>
                {rowIndex === 0 ? t`Where` : t`or`}
              </td>
              {grid.columns.map((column) => {
                const clause = row.get(column.key);
                return (
                  <td key={column.key} className={S.cell}>
                    {clause ? (
                      <Token
                        onClick={(event) =>
                          openCell({ rowIndex, column }, event.currentTarget)
                        }
                        onRemove={() =>
                          onCommit(
                            setCell(grid, rowIndex, column.key, undefined),
                          )
                        }
                      >
                        {getFilterLabel(query, stageIndex, clause)}
                      </Token>
                    ) : (
                      <UnstyledButton
                        className={S.any}
                        onClick={(event) =>
                          openCell({ rowIndex, column }, event.currentTarget)
                        }
                      >
                        {t`any`}
                      </UnstyledButton>
                    )}
                  </td>
                );
              })}
              <td />
              <td className={S.actions}>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  c="text-secondary"
                  leftSection={<Icon name="copy" />}
                  onClick={() =>
                    onCommit(duplicateRow(query, stageIndex, grid, rowIndex))
                  }
                >
                  {t`duplicate`}
                </Button>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  c="text-secondary"
                  aria-label={t`Remove row`}
                  onClick={() => onCommit(removeRow(grid, rowIndex))}
                >
                  <Icon name="close" size={12} />
                </Button>
              </td>
            </tr>
          ))}
          <tr>
            <td />
            <td colSpan={grid.columns.length + 2}>
              <Button
                size="compact-sm"
                variant="subtle"
                c="text-secondary"
                leftSection={<Icon name="add" />}
                onClick={() => onCommit(addRow(grid))}
              >
                {t`or (new row)`}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>

      <Popover
        opened={cell != null}
        position="bottom-start"
        transitionProps={{ duration: 0 }}
        onChange={(opened) => !opened && setOpenCell(undefined)}
      >
        <Popover.Target>
          <Box
            pos="absolute"
            style={{ pointerEvents: "none", ...cell?.anchor }}
          />
        </Popover.Target>
        <Popover.Dropdown>
          {cell && cell.target.column.column ? (
            <FilterPickerBody
              query={query}
              stageIndex={stageIndex}
              column={cell.target.column.column}
              filter={openClause}
              onChange={(filterable) => commitCell(cell.target, filterable)}
            />
          ) : (
            cell && (
              <FilterPicker
                query={query}
                stageIndex={stageIndex}
                filter={openClause}
                onSelect={(filterable) => commitCell(cell.target, filterable)}
                onClose={() => setOpenCell(undefined)}
              />
            )
          )}
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}
