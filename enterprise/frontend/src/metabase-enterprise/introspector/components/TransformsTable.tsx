import { t } from "ttag";

import {
  ActionIcon,
  Badge,
  Box,
  Checkbox,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import type {
  IntrospectorRow,
  TransformLastRun,
  TransformTargetTable,
} from "../types";

import { ReasonsCell } from "./reasons";

interface Props {
  rows: IntrospectorRow[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  isLoading?: boolean;
  isAllSelected?: boolean;
  /** Single-row archive — fires the same `POST /:id/archive` the bulk bar uses. */
  onTrash: (row: IntrospectorRow) => void;
}

const STATUS_COLOR: Record<string, "error" | "warning" | "success" | "brand"> =
  {
    failed: "error",
    timeout: "error",
    canceled: "warning",
    succeeded: "success",
  };

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--mb-color-border)",
  textAlign: "left",
  verticalAlign: "top",
  // Hard-wrap inside fixed-width cells so long names / reasons grow the row
  // vertically instead of forcing a horizontal scrollbar.
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const headStyle: React.CSSProperties = {
  ...cellStyle,
  background: "var(--mb-color-bg-light)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--mb-color-text-secondary)",
  fontWeight: 600,
};

function formatDuration(ms: number | null) {
  if (ms == null) {
    return null;
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const s = ms / 1000;
  if (s < 60) {
    return `${s.toFixed(1)}s`;
  }
  const m = s / 60;
  if (m < 60) {
    return `${m.toFixed(1)}m`;
  }
  return `${(m / 60).toFixed(1)}h`;
}

function FlagsCell({ flags }: { flags: string[] }) {
  if (!flags.length) {
    return (
      <Text size="sm" c="text-secondary">
        —
      </Text>
    );
  }
  return (
    <Group gap="xs">
      {flags.map((flag) => (
        <Badge
          key={flag}
          color={flag === "broken" ? "error" : "warning"}
          variant="light"
        >
          {flag}
        </Badge>
      ))}
    </Group>
  );
}

function TargetTableCell({
  table,
  transformType,
}: {
  table: TransformTargetTable | null | undefined;
  transformType: string | null | undefined;
}) {
  if (!table) {
    return (
      <Text size="sm" c="text-secondary">
        —
      </Text>
    );
  }
  const qualified = table.schema ? `${table.schema}.${table.name}` : table.name;
  const subtitleParts = [
    table.db_name ?? null,
    transformType ? transformType : null,
  ].filter(Boolean);
  return (
    <Stack gap={2}>
      <Text size="sm" ff="monospace">
        {qualified}
      </Text>
      <Group gap={6}>
        {subtitleParts.length > 0 && (
          <Text size="xs" c="text-secondary">
            {subtitleParts.join(" · ")}
          </Text>
        )}
        {!table.active && (
          <Text size="xs" c="error" fw={600}>
            {t`missing in DB`}
          </Text>
        )}
      </Group>
    </Stack>
  );
}

function LastRunCell({ lastRun }: { lastRun: TransformLastRun | null }) {
  if (!lastRun) {
    return (
      <Text size="sm" c="text-secondary">
        —
      </Text>
    );
  }
  const color = STATUS_COLOR[lastRun.status] ?? "brand";
  const ended = lastRun.end_time ?? lastRun.start_time;
  const duration = formatDuration(lastRun.duration_ms);
  return (
    <Stack gap={2}>
      <Text size="sm" fw={600} c={color}>
        {lastRun.status}
      </Text>
      {ended && (
        <Text size="xs" c="text-secondary">
          {new Date(ended).toLocaleString()}
        </Text>
      )}
      {duration && (
        <Text size="xs" c="text-secondary">
          {duration}
        </Text>
      )}
    </Stack>
  );
}

/**
 * Per-row action cluster — Trash only. Open moved onto the Name column
 * (clicking the name opens the transform's definition page).
 *
 * Runs/Inspector/Suppress/dependency-graph deliberately omitted from the row;
 * users who need those navigate from the transform definition page, and bulk
 * Suppress/Trash live in the floating action bar when rows are selected.
 */
function RowActions({
  row,
  onTrash,
}: {
  row: IntrospectorRow;
  onTrash: (row: IntrospectorRow) => void;
}) {
  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      <Tooltip label={t`Move to Trash`}>
        <ActionIcon
          variant="subtle"
          color="error"
          onClick={() => onTrash(row)}
          aria-label={t`Move to Trash`}
        >
          <Icon name="trash" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function TransformsTable({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  isLoading,
  isAllSelected,
  onTrash,
}: Props) {
  if (!isLoading && rows.length === 0) {
    return (
      <Box p="xl" ta="center">
        <Text c="text-secondary">
          {t`Nothing needs attention — your transforms look healthy.`}
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      {/* `tableLayout: fixed` + colgroup widths together pin the columns so
          long text wraps vertically inside its cell — no horizontal scroll. */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: 36 }} />
          {/* Name — narrow on purpose so long names wrap, leaving room for the
              wider columns to the right. */}
          <col style={{ width: "16%" }} />
          <col style={{ width: 96 }} />
          {/* Target table — needs room for schema.name + db · type subtitle.  */}
          <col style={{ width: "18%" }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 120 }} />
          {/* Reasons — gets the remaining flex. */}
          <col />
          {/* Actions: Trash only. Open moved onto the Name column. */}
          <col style={{ width: 56 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={headStyle}>
              <Checkbox
                checked={!!isAllSelected}
                onChange={onToggleSelectAll}
                aria-label={t`Select all`}
              />
            </th>
            <th style={headStyle}>{t`Name`}</th>
            <th style={headStyle}>{t`Flags`}</th>
            <th style={headStyle}>{t`Target table`}</th>
            <th style={headStyle}>{t`Latest run`}</th>
            <th style={headStyle}>{t`Dependents`}</th>
            <th style={headStyle}>{t`Creator`}</th>
            <th style={headStyle}>{t`Reasons`}</th>
            <th style={headStyle} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selectedIds.has(row.id);
            return (
              <tr
                key={row.id}
                style={
                  isSelected
                    ? { background: "var(--mb-color-bg-light)" }
                    : undefined
                }
              >
                <td style={cellStyle}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => onToggleSelect(row.id)}
                    aria-label={t`Select row`}
                  />
                </td>
                <td style={cellStyle}>
                  <Stack gap={2}>
                    {/* Name doubles as the deep link to the transform's
                        definition page — replaces the separate Open icon
                        in the row-actions cluster. */}
                    <Text
                      component="a"
                      href={`/data-studio/transforms/${row.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      fw={600}
                      c="brand"
                      style={{ textDecoration: "none" }}
                    >
                      {row.name}
                    </Text>
                    {row.description && (
                      <Text size="xs" c="text-secondary">
                        {row.description}
                      </Text>
                    )}
                  </Stack>
                </td>
                <td style={cellStyle}>
                  <FlagsCell flags={row.flags ?? []} />
                </td>
                <td style={cellStyle}>
                  <TargetTableCell
                    table={row.target_table ?? null}
                    transformType={row.transform_type}
                  />
                </td>
                <td style={cellStyle}>
                  <LastRunCell lastRun={row.last_run ?? null} />
                </td>
                <td style={cellStyle}>
                  <Text size="sm" fw={500}>
                    {row.dependent_count ?? 0}
                  </Text>
                </td>
                <td style={cellStyle}>
                  <Text size="sm">{row.creator?.common_name ?? "—"}</Text>
                </td>
                <td style={cellStyle}>
                  <ReasonsCell reasons={row.reasons} />
                </td>
                <td style={cellStyle}>
                  <RowActions row={row} onTrash={onTrash} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  );
}
