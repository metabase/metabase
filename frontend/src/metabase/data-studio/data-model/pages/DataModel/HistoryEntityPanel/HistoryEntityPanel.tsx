import type { Ref } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { SidebarSection } from "metabase/common/components/DetailSidebar";
import {
  type HistoryCheckId,
  type HistoryEntity,
  type HistoryProfile,
  type HistoryVersion,
  useHistoryReviewStatus,
} from "metabase/metadata/table-structure";
import { Alert, Badge, Group, Icon, Stack, Text, Timeline } from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  DetailPanel,
  DetailPanelHeader,
  FieldDetailsSkeleton,
} from "../DetailPanel";
import { formatDate, getEntityNoun } from "../TableSection/TableHistory";

const DAY_MS = 24 * 60 * 60 * 1000;

const ISSUE_SEVERITY: Record<HistoryCheckId, "failed" | "warning"> = {
  "durable-key": "failed",
  "one-current": "failed",
  overlap: "failed",
  gap: "warning",
  "valid-range": "failed",
  "has-current": "warning",
  "version-order": "warning",
  "latest-tie": "warning",
};

function getIssueMessage(issue: HistoryCheckId, currentCount: number) {
  const messages: Record<HistoryCheckId, string> = {
    "durable-key": t`Every version looks like its own entity.`,
    "one-current": t`${currentCount} versions are marked current. Compare current-row rules on the check to pick one that works.`,
    overlap: t`Two versions are valid at the same time, so a date can match both.`,
    gap: t`There's a gap between two versions, so some dates match no version.`,
    "valid-range": t`A version ends before it starts.`,
    "has-current": t`No version is current, so it was probably deleted at the source.`,
    "version-order": t`The version number goes down between two versions.`,
    "latest-tie": t`Two latest rows share the same time, so which one is current isn't decided.`,
  };
  return messages[issue];
}

type HistoryEntityPanelProps = {
  ref?: Ref<HTMLDivElement>;
  table: Table;
  entityKey: string;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
};

export function HistoryEntityPanel({
  ref,
  table,
  entityKey,
  defaultWidth,
  onWidthChange,
  onClose,
}: HistoryEntityPanelProps) {
  const status = useHistoryReviewStatus(table);
  const profile =
    status?.profileState.status === "loaded"
      ? status.profileState.profile
      : undefined;
  const entity = profile?.entities.find((entity) => entity.key === entityKey);
  const noun = getEntityNoun(table, profile?.durableKeyField.name);

  return (
    <DetailPanel
      ref={ref}
      defaultWidth={defaultWidth}
      onWidthChange={onWidthChange}
      data-testid="history-entity-panel"
    >
      <DetailPanelHeader
        icon="history"
        label={t`A ${noun.one} in ${table.display_name}`}
        title={entity?.label ?? entityKey}
        isLoading={profile == null}
        onClose={onClose}
      />
      {profile && entity ? (
        <EntityVersions profile={profile} entity={entity} />
      ) : (
        <FieldDetailsSkeleton />
      )}
    </DetailPanel>
  );
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

function getSeam(previous: HistoryVersion, next: HistoryVersion) {
  if (next.validFrom == null) {
    return null;
  }
  if (previous.isOpen) {
    return {
      color: "feedback-negative" as const,
      text: t`Still open when the next version starts`,
    };
  }
  if (previous.validTo == null) {
    return null;
  }
  const days = daysBetween(previous.validTo, next.validFrom);
  if (days < 0) {
    return {
      color: "feedback-negative" as const,
      text: ngettext(
        msgid`Overlaps the next version by ${-days} day`,
        `Overlaps the next version by ${-days} days`,
        -days,
      ),
    };
  }
  if (days > 0) {
    return {
      color: "feedback-warning" as const,
      text: ngettext(
        msgid`${days} day gap before the next version`,
        `${days} day gap before the next version`,
        days,
      ),
    };
  }
  return null;
}

function getChangedValues(
  profile: HistoryProfile,
  previous: HistoryVersion | undefined,
  version: HistoryVersion,
) {
  return profile.columns
    .filter((column) => column.changeCount > 0)
    .map((column) => column.field)
    .filter(
      (field) =>
        previous == null ||
        !_.isEqual(previous.values[field.name], version.values[field.name]),
    )
    .map((field) => ({
      label: field.display_name,
      from: previous ? String(previous.values[field.name] ?? "") : null,
      to: String(version.values[field.name] ?? ""),
    }));
}

function EntityVersions({
  profile,
  entity,
}: {
  profile: HistoryProfile;
  entity: HistoryEntity;
}) {
  const currentCount = entity.versions.filter(
    (version) => version.isCurrent,
  ).length;

  return (
    <Stack gap="xxl">
      {entity.issues.map((issue) => (
        <Alert
          key={issue}
          color={ISSUE_SEVERITY[issue] === "failed" ? "error" : "warning"}
          icon={
            <Icon
              name={
                ISSUE_SEVERITY[issue] === "failed"
                  ? "warning_round_filled"
                  : "warning"
              }
            />
          }
        >
          {getIssueMessage(issue, currentCount)}
        </Alert>
      ))}
      <SidebarSection
        title={t`Versions`}
        titleAside={
          <Text size="sm" c="text-secondary">
            {t`${profile.durableKeyField.display_name} ${entity.key}`}
          </Text>
        }
      >
        <Timeline bulletSize={20} lineWidth={2} active={entity.versions.length}>
          {entity.versions.map((version, index) => {
            const previous = entity.versions[index - 1];
            const next = entity.versions[index + 1];
            const seam = next ? getSeam(version, next) : null;
            return (
              <Timeline.Item
                key={version.rowIndex}
                bullet={<Icon name="history" size={12} />}
                title={
                  <Group gap="sm">
                    <Text fw="bold">
                      {t`${formatDate(version.validFrom)} to ${version.isOpen ? t`now` : formatDate(version.validTo)}`}
                    </Text>
                    {version.isCurrent && (
                      <Badge color="brand" variant="light">{t`Current`}</Badge>
                    )}
                  </Group>
                }
                data-testid="history-entity-version"
              >
                <Stack gap={4} mt={4}>
                  {getChangedValues(profile, previous, version).map(
                    ({ label, from, to }) => (
                      <Text key={label} size="sm" c="text-secondary">
                        {from == null
                          ? t`${label}: ${to}`
                          : t`${label}: ${from} → ${to}`}
                      </Text>
                    ),
                  )}
                  {version.version != null && (
                    <Text size="xs" c="text-secondary">
                      {t`Version ${String(version.version)}`}
                    </Text>
                  )}
                  {seam && (
                    <Group gap={4}>
                      <Icon name="warning" size={12} c={seam.color} />
                      <Text size="sm" c={seam.color}>
                        {seam.text}
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Timeline.Item>
            );
          })}
        </Timeline>
      </SidebarSection>
    </Stack>
  );
}
