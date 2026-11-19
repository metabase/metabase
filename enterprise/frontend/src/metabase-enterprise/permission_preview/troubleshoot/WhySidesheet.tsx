import type { ReactNode } from "react";
import { msgid, ngettext, t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { Badge, Flex, Icon, Stack, Text } from "metabase/ui";

import type { MissingAttribute, PreviewCell, PreviewSecurity } from "../api";
import { formatList } from "../format-list";

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
  /** Every group's rule that applies to a table; `security` alone when a table's rules aren't listed. */
  policies?: PreviewSecurity[];
  /** The attributes the person lacks that a rule on this table reads, which fail every query that reaches it. */
  missingAttributes?: MissingAttribute[];
};

/** Every row and column security rule or impersonation that applies to a table's View data, one per group. */
export function getPolicies({
  column,
  security,
  policies,
}: WhyTarget): PreviewSecurity[] {
  if (column !== "view_data") {
    return [];
  }
  return policies ?? (security != null ? [security] : []);
}

/** A table that more than one group's row and column security applies to: every query that reaches it fails. */
export function isConflicting(target: WhyTarget) {
  return getConflictingGroupNames(target).length > 1;
}

function getConflictingGroupNames(target: WhyTarget) {
  return getPolicies(target)
    .filter((policy) => policy.kind === "sandbox")
    .map((policy) => policy.group_name);
}

/** "Sales and Finance readers both set row and column security on Products." */
export function getConflictSentence(target: WhyTarget) {
  const groupNames = getConflictingGroupNames(target);
  const groups = formatList(groupNames);
  const table = target.title;
  return groupNames.length === 2
    ? t`${groups} both set row and column security on ${table}.`
    : t`${groups} all set row and column security on ${table}.`;
}

/** What fixes it: the groups' rules can't both stay. */
export function getConflictFix(target: WhyTarget) {
  const table = target.title;
  return t`Keep one policy, or give one of the groups Can view on ${table}.`;
}

/** A table that every query reaching it fails on: two groups' row and column security, or an attribute a rule reads that the person lacks. */
export function isFailing(target: WhyTarget) {
  return isConflicting(target) || hasMissingAttributes(target);
}

export function hasMissingAttributes({ missingAttributes }: WhyTarget) {
  return (missingAttributes ?? []).length > 0;
}

/** "Sales needs the attributes category and state, which Sandy Sales doesn't have.", one per group whose rule needs one. */
export function getMissingAttributeSentences(target: WhyTarget) {
  const { who, missingAttributes = [] } = target;
  const groups = getPolicies(target).map(({ group_id, group_name }) => ({
    group: group_name,
    attributes: missingAttributes
      .filter((missing) => missing["group-id"] === group_id)
      .map(({ attribute }) => attribute),
  }));
  return groups
    .filter(({ attributes }) => attributes.length > 0)
    .map(({ group, attributes }) => {
      const list = formatList(attributes);
      return ngettext(
        msgid`${group} needs the attribute ${list}, which ${who} doesn't have.`,
        `${group} needs the attributes ${list}, which ${who} doesn't have.`,
        attributes.length,
      );
    });
}

/** What fixes it: give the person a value, or try one in the preview. */
export function getMissingAttributeFix({ who, missingAttributes }: WhyTarget) {
  const count = new Set(
    (missingAttributes ?? []).map(({ attribute }) => attribute),
  ).size;
  return ngettext(
    msgid`Set it on ${who}, or pick a value for it in the preview.`,
    `Set them on ${who}, or pick values for them in the preview.`,
    count,
  );
}

export function WhyContent({ target }: { target: WhyTarget }) {
  const { column, cell } = target;
  const policies = getPolicies(target);
  const option = isFailing(target)
    ? getPreviewOption("view_data", "blocked")
    : getPreviewOption(column, cell.value);
  const [firstLine, ...otherLines] = isFailing(target)
    ? getFailureLines(target)
    : [getResultSentence(target)];
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
          <Text>{firstLine}</Text>
        </Flex>
        {otherLines.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
        {cell.note && <Text>{cell.note}</Text>}
      </SidesheetCard>

      {policies.map((security) => (
        <SidesheetCard
          key={security.group_id}
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
      ))}

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

/** Why every query reaching the table fails, and what fixes it: the conflict first, then the missing attributes. */
function getFailureLines(target: WhyTarget) {
  return [
    ...(isConflicting(target)
      ? [getConflictSentence(target), getConflictFix(target)]
      : []),
    ...(hasMissingAttributes(target)
      ? [
          ...getMissingAttributeSentences(target),
          getMissingAttributeFix(target),
        ]
      : []),
  ];
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
