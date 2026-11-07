import { useElementSize } from "@mantine/hooks";
import type { SortingState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  TRANSITION_KINDS,
  type TransitionKind,
  getTransitionKindLabel,
} from "metabase/metadata/lifecycle";
import {
  Box,
  Select,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";

import { InferredIcon } from "../InferenceReview";

import type { TransitionRow } from "./use-process-model";

// The tree table's header and row heights, to size the frame to its rows
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 44;
const MAX_VISIBLE_ROWS = 10;
// From and To at their minimums, Times seen, Expectedness, and cell padding
const MIN_WIDTH_WITH_COUNT = 520;

type TransitionNode = { id: string; row: TransitionRow };

/**
 * PROTOTYPE: mocked. The moves between statuses as a table, like the table
 * list: where each starts and ends, how often it was seen, and whether it's
 * expected. Picking an expectedness, even sync's own guess, confirms it.
 */
export function TransitionsTable({
  rows,
  readOnly,
  onKindChange,
}: {
  rows: TransitionRow[];
  readOnly: boolean;
  onKindChange: (key: string, kind: TransitionKind) => void;
}) {
  const { ref, width } = useElementSize();
  // Times seen is the first to go when the drawer is narrow
  const showCount = width >= MIN_WIDTH_WITH_COUNT;
  const data = useMemo(
    (): TransitionNode[] =>
      // Most seen first; ties keep the order's happy path first
      [...rows]
        .sort((a, b) => b.count - a.count)
        .map((row) => ({ id: row.key, row })),
    [rows],
  );

  const columns = useMemo((): TreeTableColumnDef<TransitionNode>[] => {
    const from: TreeTableColumnDef<TransitionNode> = {
      id: "from",
      header: t`From`,
      minWidth: 100,
      accessorFn: (node) => node.row.from,
      cell: ({ row }) => <Text truncate>{row.original.row.from}</Text>,
    };
    const to: TreeTableColumnDef<TransitionNode> = {
      id: "to",
      header: t`To`,
      minWidth: 100,
      accessorFn: (node) => node.row.to,
      cell: ({ row }) => <Text truncate>{row.original.row.to}</Text>,
    };
    const count: TreeTableColumnDef<TransitionNode> = {
      id: "count",
      header: t`Times seen`,
      width: "auto",
      accessorFn: (node) => node.row.count,
      cell: ({ row }) => (
        <Box w="100%" ta="right">
          {row.original.row.count.toLocaleString()}
        </Box>
      ),
    };
    const kind: TreeTableColumnDef<TransitionNode> = {
      id: "kind",
      header: t`Expectedness`,
      width: 190,
      // Typical, then Allowed, then Unexpected, not alphabetical
      accessorFn: (node) => TRANSITION_KINDS.indexOf(node.row.resolvedKind),
      sortDescFirst: false,
      cell: ({ row }) => (
        <ExpectednessSelect
          row={row.original.row}
          disabled={readOnly}
          onChange={(value) => onKindChange(row.original.id, value)}
        />
      ),
    };
    return showCount ? [from, to, count, kind] : [from, to, kind];
  }, [readOnly, onKindChange, showCount]);

  // Unexpected moves first, the most seen at the top: what an admin should
  // look at. Times seen drops out while its column is hidden; the data's own
  // order already puts the most seen first.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "kind", desc: true },
    { id: "count", desc: true },
  ]);
  const visibleSorting = sorting.filter(
    ({ id }) => showCount || id !== "count",
  );

  const instance = useTreeTableInstance({
    data,
    columns,
    getNodeId: (node) => node.id,
    defaultRowHeight: ROW_HEIGHT,
    sorting: visibleSorting,
    onSortingChange: setSorting,
  });

  return (
    <Box
      ref={ref}
      h={HEADER_HEIGHT + Math.min(rows.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT}
      data-testid="transitions-table"
    >
      <TreeTable instance={instance} ariaLabel={t`Transitions`} />
    </Box>
  );
}

function ExpectednessSelect({
  row,
  disabled,
  onChange,
}: {
  row: TransitionRow;
  disabled: boolean;
  onChange: (kind: TransitionKind) => void;
}) {
  const isGuess = !row.isOverridden;
  return (
    <Select
      aria-label={t`Expectedness of ${row.from} to ${row.to}`}
      size="xs"
      w="100%"
      data={TRANSITION_KINDS.map((kind) => ({
        value: kind,
        label: getTransitionKindLabel(kind),
      }))}
      value={row.resolvedKind}
      allowDeselect={false}
      disabled={disabled}
      // Inside the field, so the guess reads as part of the value; "all" lets
      // its tooltip show over the input
      leftSection={
        isGuess ? (
          <InferredIcon
            description={
              disabled
                ? t`Inferred: ${row.signal}`
                : t`Inferred: ${row.signal}. Pick a value to confirm it.`
            }
          />
        ) : undefined
      }
      leftSectionPointerEvents="all"
      // Fires for the current value too, so picking sync's guess confirms it
      onOptionSubmit={(value) => {
        const kind = TRANSITION_KINDS.find((known) => known === value);
        if (kind) {
          onChange(kind);
        }
      }}
    />
  );
}
