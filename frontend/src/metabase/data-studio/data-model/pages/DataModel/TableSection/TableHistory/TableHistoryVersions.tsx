import { useState } from "react";
import { t } from "ttag";

import { SidebarSection } from "metabase/common/components/DetailSidebar";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type HistoryProfile,
  type HistoryVersion,
  useHistoryReview,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { useNavigate } from "metabase/router";
import {
  Box,
  Button,
  Code,
  Group,
  Icon,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { RowValue, Table } from "metabase-types/api";

import { HistoryChecksSummary } from "./HistoryChecksSummary";
import { HistoryPreviewGrid, type PreviewColumn } from "./HistoryPreviewGrid";
import { buildCurrentRowsSql } from "./current-rows-sql";
import {
  type EntityNoun,
  countOf,
  formatDate,
  getEntityNoun,
} from "./history-labels";

const PREVIEW_GRID_HEIGHT = 280;

type PreviewScope = "current" | "all";

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
        message={t`Pick the entity key and valid from columns in Details to see this table's versions.`}
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
  const noun = getEntityNoun(profile.durableKeyField);

  return (
    <Stack gap="xxl" data-testid="table-history-versions">
      <ReviewSummary
        table={table}
        isConfirmed={status.isConfirmed}
        confirmedAt={status.confirmedAt}
        readOnly={readOnly}
      />
      <CurrentRowsTransform table={table} noun={noun} readOnly={readOnly} />
      <HistoryDataPreview table={table} profile={profile} noun={noun} />
    </Stack>
  );
}

function ReviewSummary({
  table,
  isConfirmed,
  confirmedAt,
  readOnly,
}: {
  table: Table;
  isConfirmed: boolean;
  confirmedAt: string | null;
  readOnly: boolean;
}) {
  const structure = useTableStructures().getTableStructure(table);
  const { confirm } = useHistoryReview(table);

  return (
    <Paper
      withBorder
      radius="lg"
      px="lg"
      py="sm"
      data-testid="history-review-summary"
    >
      <Group justify="space-between" wrap="nowrap" align="center" gap="lg">
        <Stack gap={0} miw={0} flex={1}>
          <HistoryChecksSummary table={table} />
          {isConfirmed && (
            <Text size="sm" c="text-secondary" pb="xs">
              {t`Metadata reviewed by an admin on ${formatDate(confirmedAt)}.`}
            </Text>
          )}
        </Stack>
        {!isConfirmed && (
          <Button
            variant="filled"
            disabled={readOnly}
            flex="0 0 auto"
            onClick={() => confirm(structure)}
            data-testid="confirm-history-button"
          >
            {t`Confirm metadata`}
          </Button>
        )}
      </Group>
    </Paper>
  );
}

function CurrentRowsTransform({
  table,
  noun,
  readOnly,
}: {
  table: Table;
  noun: EntityNoun;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const structure = useTableStructures().getTableStructure(table);
  const sql = buildCurrentRowsSql(table, table.fields ?? [], structure.history);
  if (sql == null) {
    return null;
  }

  return (
    <SidebarSection title={t`Create a current-rows transform`}>
      <Text c="text-secondary">
        {t`One row per ${noun.one}, latest version only. Build models and marts on this instead of the full history.`}
      </Text>
      <Code block mah={rem(240)} style={{ overflow: "auto" }}>
        {sql}
      </Code>
      <Button
        variant="filled"
        w="fit-content"
        leftSection={<Icon name="add" />}
        disabled={readOnly}
        onClick={() =>
          navigate(Urls.newNativeTransform({ databaseId: table.db_id, sql }))
        }
        data-testid="create-current-rows-transform"
      >
        {t`Create transform`}
      </Button>
    </SidebarSection>
  );
}

const displayValue = (value: RowValue | undefined) =>
  value == null || typeof value === "object" ? null : value;

function HistoryDataPreview({
  table,
  profile,
  noun,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const [scope, setScope] = useState<PreviewScope>("current");
  const isCurrentOnly = scope === "current";
  const rows = profile.entities.flatMap((entity) =>
    isCurrentOnly
      ? entity.versions.filter((version) => version.isCurrent)
      : entity.versions,
  );
  const entityCount = profile.entities.filter(
    (entity) =>
      !isCurrentOnly || entity.versions.some((version) => version.isCurrent),
  ).length;
  const columns: PreviewColumn<HistoryVersion>[] = (table.fields ?? []).map(
    (field) => ({
      id: field.name,
      name: field.display_name,
      value: (row) => displayValue(row.values[field.name]),
    }),
  );

  return (
    <SidebarSection
      title={t`Preview`}
      titleAside={
        <SegmentedControl
          value={scope}
          data={[
            { value: "current", label: t`Current rows` },
            { value: "all", label: t`All rows` },
          ]}
          onChange={setScope}
        />
      }
    >
      <Text size="sm" c="text-secondary">
        {t`${countOf(entityCount, noun)} in ${rows.length.toLocaleString()} rows`}
      </Text>
      <Box
        h={PREVIEW_GRID_HEIGHT}
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="lg"
        style={{ overflow: "hidden" }}
      >
        <HistoryPreviewGrid key={scope} rows={rows} columns={columns} />
      </Box>
    </SidebarSection>
  );
}
