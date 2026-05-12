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
  IntrospectorEntityType,
  IntrospectorRow,
  TransformLastRun,
  TransformTargetTable,
} from "../types";

import { ConditionBadges } from "./ConditionBadges";

const STATUS_COLOR: Record<string, "error" | "warning" | "success" | "brand"> =
  {
    failed: "error",
    timeout: "error",
    canceled: "warning",
    succeeded: "success",
  };

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
  return (
    <Stack gap={2}>
      <Badge color={color} variant="light">
        {lastRun.status}
      </Badge>
      {ended && (
        <Text size="xs" c="text-secondary">
          {new Date(ended).toLocaleString()}
        </Text>
      )}
    </Stack>
  );
}

function TargetTableCell({
  table,
}: {
  table: TransformTargetTable | null | undefined;
}) {
  if (!table) {
    return (
      <Text size="sm" c="text-secondary">
        —
      </Text>
    );
  }
  const qualified = table.schema ? `${table.schema}.${table.name}` : table.name;
  return (
    <Stack gap={2}>
      <Text size="sm" ff="monospace">
        {qualified}
      </Text>
      {!table.active && <Text size="xs" c="error">{t`inactive`}</Text>}
    </Stack>
  );
}

interface Props {
  entityType: IntrospectorEntityType;
  rows: IntrospectorRow[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  isLoading?: boolean;
  isAllSelected?: boolean;
  onOpen: (row: IntrospectorRow) => string; // returns href
  onOpenDeps: (row: IntrospectorRow) => string; // returns href
  onTrash: (row: IntrospectorRow) => void;
}

const formatDate = (s: string | null | undefined) => {
  if (!s) {
    return "—";
  }
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return s;
  }
};

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--mb-color-border)",
  textAlign: "left",
  verticalAlign: "middle",
};

const headStyle: React.CSSProperties = {
  ...cellStyle,
  background: "var(--mb-color-bg-light)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--mb-color-text-secondary)",
  fontWeight: 500,
};

export function ContentTable({
  entityType,
  rows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  isLoading,
  isAllSelected,
  onOpen,
  onOpenDeps,
  onTrash,
}: Props) {
  if (!isLoading && rows.length === 0) {
    return (
      <Box p="xl" ta="center">
        <Text c="text-secondary">
          {t`Nothing needs attention — your ${entityType} look healthy.`}
        </Text>
      </Box>
    );
  }

  const isTransforms = entityType === "transforms";

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...headStyle, width: 32 }}>
            <Checkbox
              checked={!!isAllSelected}
              onChange={onToggleSelectAll}
              aria-label={t`Select all`}
            />
          </th>
          <th style={headStyle}>{t`Name`}</th>
          <th style={headStyle}>{t`Status`}</th>
          {isTransforms ? (
            <>
              <th style={headStyle}>{t`Target table`}</th>
              <th style={headStyle}>{t`Last run`}</th>
            </>
          ) : (
            <th style={headStyle}>{t`Last used`}</th>
          )}
          <th style={{ ...headStyle, width: 140 }} />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = selectedIds.has(row.id);
          const reasons = row.reasons ?? [];
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
                  <Text fw={500}>{row.name}</Text>
                  {row.description && (
                    <Text size="xs" c="text-secondary" lineClamp={1}>
                      {row.description}
                    </Text>
                  )}
                  {isTransforms && reasons.length > 0 && (
                    <Stack gap={2} mt={4}>
                      {reasons.map((r, i) => (
                        <Text
                          key={`${r.code}-${i}`}
                          size="xs"
                          c="text-secondary"
                        >
                          <Text component="span" c="error" fw={500}>
                            {r.code}
                          </Text>
                          {": "}
                          {r.detail}
                        </Text>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </td>
              <td style={cellStyle}>
                <ConditionBadges row={row} />
              </td>
              {isTransforms ? (
                <>
                  <td style={cellStyle}>
                    <TargetTableCell table={row.target_table ?? null} />
                  </td>
                  <td style={cellStyle}>
                    <LastRunCell lastRun={row.last_run ?? null} />
                  </td>
                </>
              ) : (
                <td style={cellStyle}>
                  <Text size="sm" c="text-secondary">
                    {formatDate(row.last_used_at)}
                  </Text>
                </td>
              )}
              <td style={cellStyle}>
                <Group gap="xs" justify="flex-end">
                  <Tooltip label={t`Open`}>
                    <ActionIcon
                      component="a"
                      href={onOpen(row)}
                      target="_blank"
                      variant="subtle"
                      aria-label={t`Open`}
                    >
                      <Icon name="external" />
                    </ActionIcon>
                  </Tooltip>
                  {row.is_broken ? (
                    <Tooltip label={t`Open dependency graph`}>
                      <ActionIcon
                        component="a"
                        href={onOpenDeps(row)}
                        target="_blank"
                        variant="subtle"
                        aria-label={t`Open dependency graph`}
                      >
                        <Icon name="link" />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                  <Tooltip label={t`Send to Trash`}>
                    <ActionIcon
                      variant="subtle"
                      color="error"
                      onClick={() => onTrash(row)}
                      aria-label={t`Send to Trash`}
                    >
                      <Icon name="trash" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
