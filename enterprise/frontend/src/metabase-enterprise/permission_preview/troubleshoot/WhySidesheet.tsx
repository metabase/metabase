import type { ReactNode } from "react";
import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { Badge, Flex, Icon, Stack, Text } from "metabase/ui";

import type { PreviewCell, PreviewSecurity } from "../api";

import { AttributeTag } from "./AttributeBar";
import {
  type PreviewColumn,
  getPreviewColumnName,
  getPreviewOption,
} from "./preview-options";

/** The value a "why" sidesheet explains. */
export type WhyTarget = {
  title: string;
  /** A table's database, shown after the title. */
  databaseName?: string;
  who: string;
  /** What the value is about, such as "Sample Database / Products", under its label. */
  subject: { label: string; value: string };
  column: PreviewColumn;
  cell: PreviewCell;
  security: PreviewSecurity | null;
};

export function WhyContent({ target }: { target: WhyTarget }) {
  const { column, cell, security } = target;
  const hasSecurity = column === "view_data" && security != null;
  const option = getPreviewOption(column, cell.value);
  const sameValue = getSameValueInEveryGroup(
    cell.groups.map((group) => group.value),
  );

  return (
    <>
      <SidesheetCard title={t`Result`}>
        <Flex align="flex-start" gap="sm" wrap="nowrap">
          <Icon
            name={option.icon}
            c={option.iconColor}
            mt="xxs"
            style={{ flexShrink: 0 }}
          />
          <Text>{getResultSentence(target)}</Text>
        </Flex>
        {cell.note && <Text>{cell.note}</Text>}
      </SidesheetCard>

      {hasSecurity && (
        <SidesheetCard
          title={
            security.kind === "sandbox"
              ? t`Row and column security`
              : t`Connection impersonation`
          }
        >
          <KeyValues>
            <KeyValue label={t`Set by`}>{security.group_name}</KeyValue>
            <KeyValue
              label={security.kind === "sandbox" ? t`Rows` : t`Database role`}
            >
              <SecurityRows security={security} />
            </KeyValue>
            <KeyValue label={t`Columns`}>{security.columns}</KeyValue>
          </KeyValues>
        </SidesheetCard>
      )}

      {cell.groups.length > 0 && (
        <SidesheetCard title={t`Groups`}>
          <Stack gap="lg">
            {getGroupsApplyingFirst(cell).map((group) => (
              <Flex
                key={group.group_id}
                align="flex-start"
                justify="space-between"
                columnGap="md"
                rowGap="xxs"
                // where it's narrow, the status goes under the name rather than squeezing it to nothing
                wrap="wrap"
              >
                <Flex
                  align="center"
                  gap="sm"
                  miw={0}
                  style={{ flex: "1 1 8rem" }}
                >
                  <Text style={{ overflowWrap: "anywhere" }}>{group.name}</Text>
                  {group.group_id === cell.group_id && sameValue == null && (
                    <Badge variant="light" style={{ flexShrink: 0 }}>
                      {t`Applies`}
                    </Badge>
                  )}
                </Flex>
                <PreviewValue column={column} value={group.value} />
              </Flex>
            ))}
          </Stack>
          <Text>
            {sameValue != null
              ? getSameInEveryGroupSentence(target.who, column, sameValue)
              : t`The most permissive group applies.`}
          </Text>
        </SidesheetCard>
      )}
    </>
  );
}

/** The result as one sentence: "Sandy Sales has View data set to Can view on Sample Database / Orders, from Sales." */
function getResultSentence({
  who,
  subject,
  column,
  cell,
  security,
}: WhyTarget) {
  if (column === "collection" && cell.value === "none") {
    return t`${who} can't open the ${subject.value} collection.`;
  }
  if (column === "view_data" && cell.value === "blocked") {
    return t`${who} is blocked from ${subject.value}.`;
  }
  if (column === "view_data" && security != null) {
    return getSecuritySentence(who, security);
  }
  const value = getWhyValueLabel(column, cell.value);
  const group = getSourceGroupName(cell);
  if (column === "collection") {
    return group != null
      ? t`${who} has ${value} access to the ${subject.value} collection, from ${group}.`
      : t`${who} has ${value} access to the ${subject.value} collection.`;
  }
  const permission = getPreviewColumnName(column);
  return group != null
    ? t`${who} has ${permission} set to ${value} on ${subject.value}, from ${group}.`
    : t`${who} has ${permission} set to ${value} on ${subject.value}.`;
}

/** What the rule under the sentence does: "Sandy Sales sees only the Orders rows that match the user attributes below." */
function getSecuritySentence(who: string, security: PreviewSecurity) {
  const table = security.table_name;
  if (security.kind === "impersonation") {
    const database = security.database_name;
    return t`${who} queries ${database} with the database role below.`;
  }
  return security.filters.length > 0
    ? t`${who} sees only the ${table} rows that match the user attributes below.`
    : t`${who} sees only the ${table} rows and columns that the saved question below returns.`;
}

/** The value every group gives, or null when two differ, so the most permissive one applies. */
export function getSameValueInEveryGroup(
  values: (string | null)[],
): string | null {
  const [first] = values;
  return values.every((value) => value === first) ? (first ?? null) : null;
}

/**
 * Under the groups when none differs, so none applies over another: "Sandy Sales has View data set to Can view in
 * every group they're in." `who` starts it, since a group preview's "A member of Sales" can't sit mid-sentence.
 */
export function getSameInEveryGroupSentence(
  who: string,
  column: PreviewColumn,
  value: string,
) {
  if (column === "view_data" && value === "blocked") {
    return t`${who} is blocked in every group they're in. To let them see this table, give one of those groups access.`;
  }
  const permission = getPreviewColumnName(column);
  const label = getWhyValueLabel(column, value);
  return t`${who} has ${permission} set to ${label} in every group they're in.`;
}

/** A value's name in the "why" sheets, as the permission grids show it. */
export function getWhyValueLabel(column: PreviewColumn, value: string) {
  return getPreviewOption(column, value).label;
}

/** The group whose value applies, or null when none does (an admin, a personal collection). */
export function getSourceGroupName(cell: PreviewCell): string | null {
  return (
    cell.groups.find(({ group_id }) => group_id === cell.group_id)?.name ?? null
  );
}

/**
 * A sandbox's filters, one per line: the attribute chip, then the column it filters, "state TX → People.State"; a
 * saved-question sandbox or a connection role keeps its sentence.
 */
export function SecurityRows({ security }: { security: PreviewSecurity }) {
  if (security.kind !== "sandbox" || security.filters.length === 0) {
    return <>{security.rows}</>;
  }
  return (
    <Stack gap="xs" align="flex-start">
      {security.filters.map((filter) => {
        const value = getFilterValue(filter);
        return (
          <Flex
            key={filter.attribute}
            align="center"
            columnGap="xs"
            rowGap="xxs"
            // where it's narrow, the column goes under its chip rather than cutting both short
            wrap="wrap"
            maw="100%"
            title={
              filter.column != null
                ? `${filter.attribute} ${value} → ${filter.column}`
                : undefined
            }
          >
            <AttributeTag attribute={filter.attribute} value={value} />
            {filter.column != null && (
              <Text size="sm" c="text-secondary">
                {`→ ${filter.column}`}
              </Text>
            )}
          </Flex>
        );
      })}
    </Stack>
  );
}

function getFilterValue({
  value,
  each_member,
}: PreviewSecurity["filters"][number]) {
  if (each_member) {
    return t`each member's own`;
  }
  return value ?? t`No value`;
}

function getGroupsApplyingFirst({ groups, group_id }: PreviewCell) {
  const isApplying = (group: PreviewCell["groups"][number]) =>
    group.group_id === group_id;
  return [...groups].sort(
    (left, right) =>
      Number(isApplying(right)) - Number(isApplying(left)) ||
      left.name.localeCompare(right.name),
  );
}

function PreviewValue({
  column,
  value,
}: {
  column: PreviewColumn;
  value: string;
}) {
  const option = getPreviewOption(column, value);
  return (
    <Flex align="center" gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
      <Icon name={option.icon} c={option.iconColor} />
      <Text style={{ whiteSpace: "nowrap" }}>
        {getWhyValueLabel(column, value)}
      </Text>
    </Flex>
  );
}

function KeyValues({ children }: { children: ReactNode }) {
  return <Stack gap="lg">{children}</Stack>;
}

function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="sm" c="text-secondary">
        {label}
      </Text>
      <Text component="div">{children}</Text>
    </Stack>
  );
}
