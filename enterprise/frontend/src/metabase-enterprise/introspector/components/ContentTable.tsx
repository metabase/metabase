import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import type { IntrospectorEntityType, IntrospectorRow } from "../types";

import { ConditionBadges } from "./ConditionBadges";

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
          <th style={headStyle}>{t`Last used`}</th>
          <th style={{ ...headStyle, width: 140 }} />
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
                  <Text fw={500}>{row.name}</Text>
                  {row.description && (
                    <Text size="xs" c="text-secondary" lineClamp={1}>
                      {row.description}
                    </Text>
                  )}
                </Stack>
              </td>
              <td style={cellStyle}>
                <ConditionBadges row={row} />
              </td>
              <td style={cellStyle}>
                <Text size="sm" c="text-secondary">
                  {formatDate(row.last_used_at)}
                </Text>
              </td>
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
