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
import { reasonFlagColor } from "./reasons";

function ReasonsCell({ reasons }: { reasons: IntrospectorRow["reasons"] }) {
  const list = reasons ?? [];
  if (!list.length) {
    return (
      <Text size="sm" c="text-secondary">
        —
      </Text>
    );
  }
  return (
    <Stack gap={2}>
      {list.map((r, i) => (
        <Text key={`${r.code}-${i}`} size="xs" c="text-secondary">
          <Text component="span" fw={600} c={reasonFlagColor(r.flag)}>
            {r.code}
          </Text>
          {" — "}
          {r.detail}
        </Text>
      ))}
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
  verticalAlign: "top",
  // Hard-wrap inside fixed-width cells so long names / reasons grow the row
  // vertically instead of forcing a horizontal scrollbar. Same trick the
  // TransformsTable uses.
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
    <Box>
      {/* `tableLayout: fixed` + colgroup widths pin the columns so long text
          wraps vertically inside its cell — no horizontal scroll. Mirrors
          TransformsTable so all three tabs share the same visual rhythm. */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: 36 }} />
          {/* Name — narrow on purpose so long names wrap, leaving room for
              the Reasons column to the right. */}
          <col style={{ width: "18%" }} />
          <col style={{ width: 132 }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: 108 }} />
          {/* Reasons — gets the remaining flex. */}
          <col />
          {/* Actions: (deps?) + Trash. The Open action moved onto the Name
              column — clicking the name itself opens the entity page. */}
          <col style={{ width: 88 }} />
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
            <th style={headStyle}>{t`Status`}</th>
            <th style={headStyle}>{t`Collection`}</th>
            <th style={headStyle}>{t`Last used`}</th>
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
                    {/* Row name doubles as the deep link to the entity page —
                        replaces the separate Open (external) action icon that
                        used to sit in the actions column. Opens in a new tab
                        so the introspector list stays on screen. */}
                    <Text
                      component="a"
                      href={onOpen(row)}
                      target="_blank"
                      rel="noopener noreferrer"
                      fw={600}
                      c="brand"
                      style={{ textDecoration: "none" }}
                    >
                      {row.name}
                    </Text>
                    {row.description && (
                      <Text size="xs" c="text-secondary" lineClamp={2}>
                        {row.description}
                      </Text>
                    )}
                  </Stack>
                </td>
                <td style={cellStyle}>
                  <ConditionBadges row={row} />
                </td>
                <td style={cellStyle}>
                  {row.collection_name ? (
                    <Group gap={4} wrap="nowrap">
                      <Icon name="folder" size={12} c="text-secondary" />
                      <Text
                        size="sm"
                        c="text-secondary"
                        lineClamp={1}
                        title={row.collection_name}
                      >
                        {row.collection_name}
                      </Text>
                    </Group>
                  ) : (
                    <Text size="sm" c="text-secondary">
                      {t`(Root)`}
                    </Text>
                  )}
                </td>
                <td style={cellStyle}>
                  <Text size="sm" c="text-secondary">
                    {formatDate(row.last_used_at)}
                  </Text>
                </td>
                <td style={cellStyle}>
                  <ReasonsCell reasons={row.reasons} />
                </td>
                <td style={cellStyle}>
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
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
    </Box>
  );
}
