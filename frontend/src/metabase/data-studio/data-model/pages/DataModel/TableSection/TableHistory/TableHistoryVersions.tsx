import { msgid, ngettext, t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type CurrentRule,
  type HistoryCheck,
  type HistoryProfile,
  getFailedChecks,
  useHistoryReview,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Icon,
  Select,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useHistoryEntitySelection } from "../../contexts/HistoryEntitySelectionContext";

import {
  HistoryColumnsSection,
  HistoryPreviewSection,
  HistoryRepresentationSection,
} from "./HistoryColumnsSection";
import {
  CHECK_STATUS_ICON,
  type EntityNoun,
  formatDate,
  getCheckDescription,
  getCheckTitle,
  getEntityNoun,
} from "./history-labels";

const MAX_LISTED_ENTITIES = 4;

export function TableHistoryVersions({
  table,
  readOnly,
}: {
  table: Table;
  readOnly: boolean;
}) {
  const status = useHistoryReviewStatus(table);

  if (status == null) {
    return null;
  }
  const { profileState } = status;
  if (profileState.status === "unbound") {
    return (
      <EmptyState
        message={t`Pick the durable key and valid from columns in Details to see this table's versions.`}
        spacing="sm"
      />
    );
  }
  if (profileState.status !== "loaded") {
    return (
      <LoadingAndErrorWrapper
        loading={profileState.status === "loading"}
        error={profileState.status === "error" ? profileState.error : null}
      />
    );
  }

  const { profile } = profileState;
  const noun = getEntityNoun(table, profile.durableKeyField.name);

  return (
    <Stack gap="xxl" data-testid="table-history-versions">
      <CoverageSection profile={profile} noun={noun} />
      <ChecksSection profile={profile} noun={noun} />
      <HistoryColumnsSection
        table={table}
        profile={profile}
        noun={noun}
        readOnly={readOnly}
      />
      <ExampleSection profile={profile} noun={noun} />
      <HistoryPreviewSection
        table={table}
        profile={profile}
        noun={noun}
        readOnly={readOnly}
      />
      <HistoryRepresentationSection
        table={table}
        profile={profile}
        noun={noun}
      />
      <ConfirmSection
        table={table}
        profile={profile}
        isConfirmed={status.isConfirmed}
        confirmedAt={status.confirmedAt}
        readOnly={readOnly}
      />
    </Stack>
  );
}

function getCurrentRuleDescription(rule: CurrentRule) {
  const descriptions: Record<CurrentRule, string> = {
    "current-flag": t`Where the current flag is true`,
    "valid-to-is-null": t`Where valid to is empty`,
    "latest-per-key": t`The latest version per durable key. As a segment this needs a window function.`,
  };
  return descriptions[rule];
}

function CoverageSection({
  profile,
  noun,
}: {
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const versionsPerEntity =
    profile.entityCount > 0 ? profile.rowCount / profile.entityCount : 0;
  return (
    <SidebarSection title={t`Coverage`}>
      <DetailsTable>
        <DetailsRow
          label={noun.other[0].toUpperCase() + noun.other.slice(1)}
          value={
            <Stack gap={0} py="xs">
              <Text fw="bold">{profile.entityCount.toLocaleString()}</Text>
              <Text size="sm" c="text-secondary">
                {t`Distinct ${profile.durableKeyField.display_name} values`}
              </Text>
            </Stack>
          }
        />
        <DetailsRow
          label={t`Versions`}
          value={
            <Stack gap={0} py="xs">
              <Text fw="bold">{profile.rowCount.toLocaleString()}</Text>
              <Text size="sm" c="text-secondary">
                {t`${versionsPerEntity.toFixed(1)} per ${noun.one} on average, up to ${profile.maxVersionCount}`}
              </Text>
            </Stack>
          }
        />
        <DetailsRow
          label={t`Current versions`}
          value={
            <Stack gap={0} py="xs">
              <Text fw="bold">{profile.currentRowCount.toLocaleString()}</Text>
              <Text size="sm" c="text-secondary">
                {getCurrentRuleDescription(profile.currentRule)}
              </Text>
            </Stack>
          }
        />
        <DetailsRow
          label={t`Valid from`}
          value={t`${formatDate(profile.firstValidFrom)} to ${formatDate(profile.lastValidFrom)}`}
        />
      </DetailsTable>
    </SidebarSection>
  );
}

function ChecksSection({
  profile,
  noun,
}: {
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const failedCount = getFailedChecks(profile).length;
  return (
    <SidebarSection
      title={t`Checks`}
      titleAside={
        failedCount > 0 ? (
          <Badge color="negative" variant="light">
            {t`${failedCount} failing`}
          </Badge>
        ) : (
          <Badge color="positive" variant="light">{t`All pass`}</Badge>
        )
      }
    >
      <DetailsTable>
        {profile.checks.map((check) => (
          <CheckRow
            key={check.id}
            check={check}
            profile={profile}
            noun={noun}
          />
        ))}
      </DetailsTable>
    </SidebarSection>
  );
}

function CheckRow({
  check,
  profile,
  noun,
}: {
  check: HistoryCheck;
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const icon = CHECK_STATUS_ICON[check.status];
  const listedKeys = check.entityKeys.slice(0, MAX_LISTED_ENTITIES);
  const hiddenCount = check.entityKeys.length - listedKeys.length;

  return (
    <Group
      px="lg"
      py="md"
      gap="md"
      align="flex-start"
      wrap="nowrap"
      data-testid="history-check"
    >
      <Icon name={icon.name} c={icon.color} mt={2} flex="0 0 auto" />
      <Stack gap="xs" miw={0}>
        <Text fw="bold">{getCheckTitle(check.id)}</Text>
        <Text size="sm" c="text-secondary">
          {getCheckDescription(check, profile, noun)}
        </Text>
        {listedKeys.length > 0 && (
          <Group gap="xs">
            {listedKeys.map((entityKey) => (
              <EntityLink
                key={entityKey}
                entityKey={entityKey}
                profile={profile}
              />
            ))}
            {hiddenCount > 0 && (
              <Text size="sm" c="text-secondary">
                {t`and ${hiddenCount} more`}
              </Text>
            )}
          </Group>
        )}
      </Stack>
    </Group>
  );
}

function EntityLink({
  entityKey,
  profile,
}: {
  entityKey: string;
  profile: HistoryProfile;
}) {
  const { setSelectedEntityKey } = useHistoryEntitySelection();
  const entity = profile.entities.find((entity) => entity.key === entityKey);
  return (
    <UnstyledButton onClick={() => setSelectedEntityKey(entityKey)}>
      <Badge color="brand" variant="light" style={{ cursor: "pointer" }}>
        {entity?.label ? `${entity.label} · ${entityKey}` : entityKey}
      </Badge>
    </UnstyledButton>
  );
}

function ExampleSection({
  profile,
  noun,
}: {
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const { selectedEntityKey, setSelectedEntityKey } =
    useHistoryEntitySelection();
  const entities = [...profile.entities].sort(
    (a, b) => b.versions.length - a.versions.length,
  );
  const [richest] = entities;
  const options = entities.map((entity) => ({
    value: entity.key,
    label: t`${entity.label ?? entity.key} (${entity.key}), ${entity.versions.length} versions`,
  }));

  return (
    <SidebarSection title={t`Look at one ${noun.one}`}>
      <Text size="sm" c="text-secondary">
        {t`A quick way to check the bindings: one ${noun.one}'s versions should line up end to end, with one current.`}
      </Text>
      <Select
        aria-label={t`Pick a ${noun.one}`}
        data={options}
        value={selectedEntityKey}
        placeholder={t`Pick a ${noun.one}`}
        searchable
        leftSection={<Icon name="history" />}
        onChange={(entityKey) => setSelectedEntityKey(entityKey)}
      />
      {richest && selectedEntityKey == null && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => setSelectedEntityKey(richest.key)}
        >
          {t`Open ${richest.label ?? richest.key}, which has ${richest.versions.length} versions`}
        </Button>
      )}
    </SidebarSection>
  );
}

function ConfirmSection({
  table,
  profile,
  isConfirmed,
  confirmedAt,
  readOnly,
}: {
  table: Table;
  profile: HistoryProfile;
  isConfirmed: boolean;
  confirmedAt: string | null;
  readOnly: boolean;
}) {
  const { getTableStructure } = useTableStructures();
  const { confirm } = useHistoryReview(table);
  const structure = getTableStructure(table);
  const failedCount = getFailedChecks(profile).length;

  if (isConfirmed) {
    return (
      <Alert
        color="success"
        icon={<Icon name="check_filled" />}
        title={t`History setup confirmed`}
      >
        {t`Confirmed by an admin on ${formatDate(confirmedAt)}. Changing a binding asks for a review again.`}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Divider />
      <Group justify="space-between" wrap="nowrap" align="center">
        <Text size="sm" c="text-secondary">
          {failedCount > 0
            ? ngettext(
                msgid`${failedCount} check still fails. Confirming records that you've seen it and the table is fine to use.`,
                `${failedCount} checks still fail. Confirming records that you've seen them and the table is fine to use.`,
                failedCount,
              )
            : t`Confirming records that the bindings and checks look right.`}
        </Text>
        <Button
          variant="filled"
          disabled={readOnly}
          flex="0 0 auto"
          onClick={() => confirm(structure)}
          data-testid="confirm-history-button"
        >
          {t`Confirm history setup`}
        </Button>
      </Group>
    </Stack>
  );
}
