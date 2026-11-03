import { msgid, ngettext, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  type CurrentRule,
  SCD_TYPES,
  type TableStructure,
  countsDurableKeys,
  filtersCurrentRows,
  getFailedChecks,
  getScdTypeLabel,
  isScdType,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, FieldId, Table } from "metabase-types/api";

import { countOf, getCheckDescription, getEntityNoun } from "./history-labels";

const findFieldName = (fields: Field[], fieldId: FieldId | null) =>
  fields.find((field) => getRawTableFieldId(field) === fieldId)?.name;

export function getCurrentRule(
  structure: Pick<TableStructure, "history">,
): CurrentRule {
  if (structure.history.currentFlagFieldId != null) {
    return "current-flag";
  }
  return structure.history.validToFieldId != null
    ? "valid-to-is-null"
    : "latest-per-key";
}

export function getCurrentRowsCondition(
  structure: Pick<TableStructure, "history">,
  fields: Field[],
) {
  const { currentFlagFieldId, validToFieldId, durableKeyFieldId } =
    structure.history;
  switch (getCurrentRule(structure)) {
    case "current-flag":
      return `${findFieldName(fields, currentFlagFieldId)} = true`;
    case "valid-to-is-null":
      return `${findFieldName(fields, validToFieldId)} is null`;
    case "latest-per-key":
      return t`latest version per ${findFieldName(fields, durableKeyFieldId) ?? "key"}`;
  }
}

function getScdTypeOrigin({
  scdType,
  scdTypeInference,
  isScdTypeOverridden,
}: TableStructure) {
  if (!isScdTypeOverridden) {
    return t`Inferred: ${scdTypeInference.signal}`;
  }
  return scdType === scdTypeInference.scdType
    ? t`Confirmed by an admin`
    : t`Set by an admin`;
}

export function ScdTypeInput({
  structure,
  disabled,
  onChange,
}: {
  structure: TableStructure;
  disabled: boolean;
  onChange: (scdType: TableStructure["scdType"]) => void;
}) {
  const { scdType, scdTypeInference, isScdTypeOverridden } = structure;
  const isConfirmedGuess =
    isScdTypeOverridden && scdType === scdTypeInference.scdType;
  const needsReview =
    !isScdTypeOverridden && scdTypeInference.confidence === "low";

  return (
    <Stack gap="xs" py="xs">
      {needsReview && (
        <Badge color="warning" variant="light" w="fit-content">
          {t`Needs review`}
        </Badge>
      )}
      <Select
        aria-label={t`SCD type`}
        data={SCD_TYPES.map((type) => ({
          value: String(type),
          label: getScdTypeLabel(type),
        }))}
        value={scdType != null ? String(scdType) : null}
        placeholder={t`Choose an SCD type`}
        allowDeselect={false}
        disabled={disabled}
        onChange={(value) => {
          const type = Number(value);
          if (isScdType(type)) {
            onChange(type);
          }
        }}
        data-testid="table-scd-type-select"
      />
      <Text size="sm" c="text-secondary">
        {getScdTypeOrigin(structure)}
      </Text>
      {!isScdTypeOverridden && scdTypeInference.corpusTableCount != null && (
        <Text size="xs" c="text-secondary">
          {t`This rule matched ${scdTypeInference.corpusTableCount.toLocaleString()} of the 1,372 history tables in the analysis corpus.`}
        </Text>
      )}
      {!disabled && isScdTypeOverridden && !isConfirmedGuess && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => onChange(null)}
        >
          {scdTypeInference.scdType != null
            ? t`Use the inferred type (${getScdTypeLabel(scdTypeInference.scdType)})`
            : t`Clear the SCD type`}
        </Button>
      )}
      {!disabled && needsReview && scdTypeInference.scdType != null && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => onChange(scdTypeInference.scdType)}
        >
          {t`Yes, this is ${getScdTypeLabel(scdTypeInference.scdType)}`}
        </Button>
      )}
    </Stack>
  );
}

export function CurrentFlagHint({
  structure,
  fields,
}: {
  structure: TableStructure;
  fields: Field[];
}) {
  const condition = getCurrentRowsCondition(structure, fields);
  const messages: Record<CurrentRule, string> = {
    "current-flag": t`The current version is where ${condition}.`,
    "valid-to-is-null": t`No current flag, so the current version is where ${condition}.`,
    "latest-per-key": t`No current flag or valid to, so the current version is the ${condition}.`,
  };
  return (
    <Text size="sm" c="text-secondary">
      {messages[getCurrentRule(structure)]}
    </Text>
  );
}

export function DefaultSegmentInput({
  structure,
  fields,
  disabled,
  onChange,
}: {
  structure: TableStructure;
  fields: Field[];
  disabled: boolean;
  onChange: (currentRowsOnly: boolean) => void;
}) {
  const appliesToType = filtersCurrentRows(structure.scdType);
  return (
    <Stack gap="xs" py="xs">
      <Switch
        label={t`Current records`}
        checked={appliesToType && structure.history.currentRowsOnly}
        disabled={disabled || !appliesToType}
        onChange={(event) => onChange(event.target.checked)}
        data-testid="history-current-rows-switch"
      />
      <Group gap="xs">
        <Code>{getCurrentRowsCondition(structure, fields)}</Code>
        <Text size="xs" c="text-secondary">
          {t`segment_role: current_rows, created by sync`}
        </Text>
      </Group>
      <Text size="sm" c="text-secondary">
        {appliesToType
          ? t`New questions start with a removable “Current records only” chip.`
          : t`Only SCD types 2, 4, 6 and 7 start on current records.`}
      </Text>
    </Stack>
  );
}

export function HistoryVersionsSummary({ table }: { table: Table }) {
  const status = useHistoryReviewStatus(table);
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
  const noun = getEntityNoun(table, profile.durableKeyField.name);
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
      <SummaryCountText
        table={table}
        failedDurableKeyDescription={
          durableKeyCheck?.status === "failed"
            ? getCheckDescription(durableKeyCheck, profile, noun)
            : null
        }
        entityCount={profile.entityCount}
        durableKeyName={profile.durableKeyField.name}
      />
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

function SummaryCountText({
  table,
  failedDurableKeyDescription,
  entityCount,
  durableKeyName,
}: {
  table: Table;
  failedDurableKeyDescription: string | null;
  entityCount: number;
  durableKeyName: string;
}) {
  const { scdType } = useTableStructures().getTableStructure(table);
  if (failedDurableKeyDescription) {
    return (
      <Text size="sm" c="feedback-negative">
        {failedDurableKeyDescription}
      </Text>
    );
  }
  return (
    <Text size="sm" c="text-secondary">
      {countsDurableKeys(scdType)
        ? t`Count becomes count-distinct(${durableKeyName}) = ${entityCount.toLocaleString()}.`
        : t`This SCD type keeps plain row counts.`}
    </Text>
  );
}
