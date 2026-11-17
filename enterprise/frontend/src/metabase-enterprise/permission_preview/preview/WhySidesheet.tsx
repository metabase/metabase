import type { ReactNode } from "react";
import { t } from "ttag";

import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import type { PermissionSectionConfig } from "metabase/permissions";
import { Badge, Box, Flex, Icon, Stack, Text } from "metabase/ui";

import type { PreviewCell, PreviewSecurity } from "../api";
import { AttributeTag } from "../troubleshoot/AttributeBar";

import {
  type PreviewColumn,
  getPreviewColumnName,
  getPreviewOption,
  getPreviewSection,
} from "./preview-options";

/** The value a "why" sidesheet explains. */
export type WhyTarget = {
  title: string;
  who: string;
  /** What the value is about, such as "Sample Database / Products", under its label. */
  subject: { label: string; value: string };
  column: PreviewColumn;
  cell: PreviewCell;
  security: PreviewSecurity | null;
};

type WhySidesheetProps = {
  target: WhyTarget | null;
  onClose: () => void;
};

/** Why a previewed value is what it is: the result, any row and column security, and each group's own value. */
export function WhySidesheet({ target, onClose }: WhySidesheetProps) {
  return (
    <Sidesheet
      title={target?.title}
      isOpen={target != null}
      onClose={onClose}
      withOverlay={false}
      isModal={false}
    >
      {target && <WhyContent target={target} />}
    </Sidesheet>
  );
}

/**
 * A grid cell whose hover shows a two-line summary of its "why", and whose click opens the full sidesheet; it shows
 * as selected while the sheet explains it (`explained`, matched by title and who, since the grid rebuilds its targets).
 */
export function getWhySection(
  target: WhyTarget,
  onWhy: (target: WhyTarget) => void,
  explained: WhyTarget | null,
): PermissionSectionConfig {
  return {
    ...getPreviewSection(target.column, target.cell.value, () => onWhy(target)),
    valueTooltip: <WhySummary target={target} />,
    isValueSelected:
      explained?.title === target.title && explained.who === target.who,
  };
}

function WhySummary({ target }: { target: WhyTarget }) {
  const { column, cell, security } = target;
  const label = getPreviewOption(column, cell.value).label;
  const source = cell.groups.find(({ group_id }) => group_id === cell.group_id);
  const detail = getSummaryDetail(column, cell);
  const hasSecurity = column === "view_data" && security != null;

  return (
    <Box maw="18rem">
      <Text c="inherit" fz="sm">
        <strong>{label}</strong>
        {source != null ? ` · ${getSetByText(source.name)}` : null}
      </Text>
      {hasSecurity ? (
        <SecuritySummary security={security} />
      ) : (
        detail && (
          <Text c="inherit" fz="sm" opacity={0.75}>
            {detail}
          </Text>
        )
      )}
      <Text c="inherit" fz="xs" opacity={0.6} mt="xs">
        {t`Click to see why`}
      </Text>
    </Box>
  );
}

/** The summary's second line without row and column security: what the other groups give, else the note. */
function getSummaryDetail(
  column: PreviewColumn,
  cell: PreviewCell,
): string | null {
  const otherGroups = cell.groups
    .filter(({ group_id }) => group_id !== cell.group_id)
    .map(
      ({ name, value }) => `${name}: ${getPreviewOption(column, value).label}`,
    );
  return otherGroups.length > 0 ? otherGroups.join(" · ") : cell.note;
}

/** "Rows filtered by" and the same attribute chips as the panel and the sheet, "state TX → People.State". */
function SecuritySummary({ security }: { security: PreviewSecurity }) {
  return (
    <Stack gap={4} mt={4}>
      <Text c="inherit" fz="sm" opacity={0.75}>
        {security.kind === "impersonation"
          ? t`Database role`
          : t`Rows filtered by`}
      </Text>
      <Text component="div" c="inherit" fz="sm">
        <SecurityRows security={security} />
      </Text>
    </Stack>
  );
}

function getSetByText(groupName: string) {
  return t`Set by ${groupName}`;
}

export function WhyContent({ target }: { target: WhyTarget }) {
  const { column, cell, security } = target;
  const hasSecurity = column === "view_data" && security != null;
  const isBlocked = column === "view_data" && cell.value === "blocked";
  const option = getPreviewOption(column, cell.value);

  return (
    <>
      <SidesheetCard title={t`Result`}>
        <Flex align="flex-start" gap="sm" wrap="nowrap">
          <Icon
            name={option.icon}
            c={option.iconColor}
            mt={2}
            style={{ flexShrink: 0 }}
          />
          <Text>{getResultSentence(target)}</Text>
        </Flex>
        {cell.note && <Text>{cell.note}</Text>}
        {isBlocked && (
          <Text>{t`Blocked in every group ${target.who} is in. To let ${target.who} see this table, give one of those groups access.`}</Text>
        )}
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
          <Stack gap="sm">
            {getGroupsApplyingFirst(cell).map((group) => (
              <Flex
                key={group.group_id}
                align="center"
                justify="space-between"
                gap="md"
                wrap="nowrap"
              >
                <Flex align="center" gap="sm" miw={0}>
                  <Text truncate>{group.name}</Text>
                  {group.group_id === cell.group_id &&
                    cell.groups.length > 1 && (
                      <Badge variant="light" style={{ flexShrink: 0 }}>
                        {t`Applies`}
                      </Badge>
                    )}
                </Flex>
                <PreviewValue column={column} value={group.value} />
              </Flex>
            ))}
          </Stack>
          {cell.groups.length > 1 && (
            <Text>{t`The most permissive group applies.`}</Text>
          )}
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
            rowGap={2}
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
              <Text fz="sm" c="text-secondary">
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
  return (
    <Box
      display="grid"
      style={{ gridTemplateColumns: "9rem minmax(0, 1fr)", gap: "0.5rem 1rem" }}
    >
      {children}
    </Box>
  );
}

function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Text c="text-secondary">{label}</Text>
      <Text component="div">{children}</Text>
    </>
  );
}
