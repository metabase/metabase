import type { ReactNode } from "react";
import { t } from "ttag";

import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import type { PermissionSectionConfig } from "metabase/permissions";
import { Badge, Box, Flex, Icon, Text } from "metabase/ui";

import type { PreviewCell, PreviewSecurity } from "../api";

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
    >
      {target && <WhyContent target={target} />}
    </Sidesheet>
  );
}

/** A grid cell whose hover shows a two-line summary of its "why", and whose click opens the full sidesheet. */
export function getWhySection(
  target: WhyTarget,
  onWhy: (target: WhyTarget) => void,
): PermissionSectionConfig {
  return {
    ...getPreviewSection(target.column, target.cell.value, () => onWhy(target)),
    valueTooltip: <WhySummary target={target} />,
  };
}

function WhySummary({ target }: { target: WhyTarget }) {
  const { column, cell, security } = target;
  const label = getPreviewOption(column, cell.value).label;
  const source = cell.groups.find(({ group_id }) => group_id === cell.group_id);
  const detail = getSummaryDetail(column, cell, security);

  return (
    <Box maw="18rem">
      <Text c="inherit" fz="sm">
        <strong>{label}</strong>
        {source && cell.groups.length > 0 ? t`, from ${source.name}` : null}
      </Text>
      {detail && (
        <Text c="inherit" fz="sm" opacity={0.75}>
          {detail}
        </Text>
      )}
      <Text c="inherit" fz="xs" opacity={0.6} mt="xs">
        {t`Click for why`}
      </Text>
    </Box>
  );
}

/** The summary's second line: row and column security first, else what the other groups give, else the note. */
function getSummaryDetail(
  column: PreviewColumn,
  cell: PreviewCell,
  security: PreviewSecurity | null,
): string | null {
  if (column === "view_data" && security != null) {
    return security.kind === "sandbox"
      ? t`Row security: ${security.rows}`
      : t`Connection: ${security.rows}`;
  }
  const otherGroups = cell.groups
    .filter(({ group_id }) => group_id !== cell.group_id)
    .map(
      ({ name, value }) => `${name}: ${getPreviewOption(column, value).label}`,
    );
  return otherGroups.length > 0 ? otherGroups.join(" · ") : cell.note;
}

function WhyContent({ target }: { target: WhyTarget }) {
  const { who, subject, column, cell, security } = target;
  const hasSecurity = column === "view_data" && security != null;
  const isBlocked = column === "view_data" && cell.value === "blocked";

  return (
    <>
      <SidesheetCard title={t`Result`}>
        <KeyValues>
          <KeyValue label={t`Who`}>{who}</KeyValue>
          <KeyValue label={subject.label}>{subject.value}</KeyValue>
          <KeyValue label={getPreviewColumnName(column)}>
            <PreviewValue column={column} value={cell.value} />
          </KeyValue>
        </KeyValues>
        {cell.note && <Text>{cell.note}</Text>}
        {isBlocked && (
          <Text>{t`Blocked in every group they're in. To let them see it, give one of those groups access.`}</Text>
        )}
      </SidesheetCard>

      {hasSecurity && (
        <SidesheetCard title={t`Row and column security`}>
          <KeyValues>
            <KeyValue label={t`Set by`}>{security.group_name}</KeyValue>
            <KeyValue
              label={security.kind === "sandbox" ? t`Rows` : t`Connection`}
            >
              {security.rows}
            </KeyValue>
            <KeyValue label={t`Columns`}>{security.columns}</KeyValue>
          </KeyValues>
        </SidesheetCard>
      )}

      {cell.groups.length > 0 && (
        <SidesheetCard title={t`Groups`}>
          <KeyValues>
            {cell.groups.map((group) => (
              <KeyValue key={group.group_id} label={group.name}>
                <Flex align="center" gap="sm">
                  <PreviewValue column={column} value={group.value} />
                  {group.group_id === cell.group_id &&
                    cell.groups.length > 1 && (
                      <Badge variant="light" style={{ flexShrink: 0 }}>
                        {t`Applies`}
                      </Badge>
                    )}
                </Flex>
              </KeyValue>
            ))}
          </KeyValues>
          {cell.groups.length > 1 && (
            <Text>{t`The most permissive group applies.`}</Text>
          )}
        </SidesheetCard>
      )}
    </>
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
    <Flex align="center" gap="xs">
      <Icon name={option.icon} c={option.iconColor} />
      <Text>{option.label}</Text>
    </Flex>
  );
}

function KeyValues({ children }: { children: ReactNode }) {
  return (
    <Box
      display="grid"
      style={{ gridTemplateColumns: "9rem 1fr", gap: "0.5rem 1rem" }}
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
