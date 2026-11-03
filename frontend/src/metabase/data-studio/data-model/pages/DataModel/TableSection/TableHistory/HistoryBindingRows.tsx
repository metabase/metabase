import { msgid, ngettext, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  type CurrentRowRule,
  getCurrentRowRuleOptions,
  getFailedChecks,
  getHistorySourceLabel,
  inferHistorySource,
  isCurrentRowRule,
  useHistoryReviewStatus,
} from "metabase/metadata/table-structure";
import { Badge, Button, Group, Loader, Select, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, Table } from "metabase-types/api";

import { countOf, getCheckDescription, getEntityNoun } from "./history-labels";

export function HistorySourceValue({ fields }: { fields: Field[] }) {
  const { source, signal } = inferHistorySource(fields);
  return (
    <Stack gap="xs" py="xs">
      <Text c="text-primary">{getHistorySourceLabel(source)}</Text>
      <Text size="sm" c="text-secondary">{t`Inferred: ${signal}`}</Text>
    </Stack>
  );
}

export function CurrentRowRuleInput({
  value,
  disabled,
  onChange,
}: {
  value: CurrentRowRule;
  disabled: boolean;
  onChange: (rule: CurrentRowRule) => void;
}) {
  return (
    <Select
      aria-label={t`Current row is`}
      data={getCurrentRowRuleOptions()}
      value={value}
      allowDeselect={false}
      disabled={disabled}
      onChange={(rule) => {
        if (isCurrentRowRule(rule)) {
          onChange(rule);
        }
      }}
      data-testid="history-current-row-rule-select"
    />
  );
}

export function HistoryVersionsSummary({ table }: { table: Table }) {
  const status = useHistoryReviewStatus(table);
  const noun = getEntityNoun(table);
  const versionsUrl = Urls.dataStudioData({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
    tab: "versions",
  });

  if (status == null) {
    return null;
  }
  const { profileState } = status;
  if (profileState.status === "unbound") {
    return (
      <Text c="text-secondary">{t`Pick the durable key and valid from columns`}</Text>
    );
  }
  if (profileState.status !== "loaded") {
    return <Loader size="xs" />;
  }

  const { profile } = profileState;
  const failedCount = getFailedChecks(profile).length;
  const durableKeyCheck = profile.checks.find(
    (check) => check.id === "durable-key",
  );

  return (
    <Stack gap="xs" py="xs">
      <Group gap="sm">
        <Text c="text-primary" fw="bold">
          {t`${countOf(profile.entityCount, noun)} · ${profile.rowCount.toLocaleString()} versions`}
        </Text>
        {status.isConfirmed ? (
          <Badge color="positive" variant="light">{t`Confirmed`}</Badge>
        ) : (
          failedCount > 0 && (
            <Badge color="negative" variant="light">
              {ngettext(
                msgid`${failedCount} check fails`,
                `${failedCount} checks fail`,
                failedCount,
              )}
            </Badge>
          )
        )}
      </Group>
      {durableKeyCheck?.status === "failed" ? (
        <Text size="sm" c="feedback-negative">
          {getCheckDescription(durableKeyCheck, profile, noun)}
        </Text>
      ) : (
        <Text size="sm" c="text-secondary">
          {t`Counting rows gives ${profile.entityCount.toLocaleString()}, the number of distinct ${profile.durableKeyField.display_name} values.`}
        </Text>
      )}
      <Button
        component={Link}
        to={versionsUrl}
        size="compact-sm"
        variant="subtle"
        w="fit-content"
        px={0}
      >
        {t`Review versions`}
      </Button>
    </Stack>
  );
}
