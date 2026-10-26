import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { skipToken, useGetDatabaseMetadataQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Icon,
  Loader,
  Modal,
  MultiSelect,
  SegmentedControl,
  type SegmentedControlItem,
  Stack,
  Text,
} from "metabase/ui";
import {
  useGetMetadataGenerationEstimateQuery,
  useGetMetadataGenerationRunQuery,
  useStartMetadataGenerationRunMutation,
} from "metabase-enterprise/api";
import type {
  ConcreteTableId,
  DatabaseId,
  MetadataGenerationAttribute,
  MetadataGenerationRun,
  MetadataGenerationRunId,
  MetadataGenerationRunRequest,
} from "metabase-types/api";

import {
  DEFAULT_ATTRIBUTES,
  formatTokens,
  getAttributePluralLabel,
  getRunTitle,
  getUnavailableMessage,
  isRunActive,
} from "../../utils";
import { RunProgress } from "../RunProgress";

const ALL_ATTRIBUTES: MetadataGenerationAttribute[] = [
  "semantic_type",
  "data_sensitivity",
  "description",
];

type ScopeType = "database" | "schemas" | "tables";

type GenerateMetadataModalProps = {
  databaseId: DatabaseId;
  initialTableIds?: ConcreteTableId[];
  /** When true, the run covers exactly `initialTableIds` and the form offers no scope choice. */
  isScopeFixed?: boolean;
  /** A run to show the progress of, instead of the form. The owner keeps it, so it decides what reopening shows. */
  runId?: MetadataGenerationRunId | null;
  opened: boolean;
  onClose: () => void;
  onReview?: () => void;
  /** Called with the run the form starts, or a retry starts. */
  onRunStarted?: (runId: MetadataGenerationRunId) => void;
};

export function GenerateMetadataModal({
  databaseId,
  initialTableIds,
  isScopeFixed = false,
  runId: externalRunId,
  opened,
  onClose,
  onReview,
  onRunStarted,
}: GenerateMetadataModalProps) {
  const runId = externalRunId ?? null;
  const { data: run } = useGetMetadataGenerationRunQuery(runId ?? skipToken);
  const isRunView = runId != null;
  // Closing a running run only hides the window: the run continues, and the
  // database panel reopens it.
  const isMinimizable = isRunView && (run == null || isRunActive(run));

  return (
    <Modal
      opened={opened}
      title={getTitle(isRunView, run)}
      size="lg"
      closeButtonProps={
        isMinimizable
          ? { icon: <Icon name="minimize" />, "aria-label": t`Minimize` }
          : undefined
      }
      onClose={onClose}
    >
      {isRunView ? (
        <RunProgress
          key={runId}
          runId={runId}
          onRetry={(run) => onRunStarted?.(run.id)}
          onReview={onReview}
        />
      ) : (
        <GenerateMetadataForm
          databaseId={databaseId}
          initialTableIds={initialTableIds}
          isScopeFixed={isScopeFixed}
          onStarted={(runId) => onRunStarted?.(runId)}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}

function getTitle(
  isRunView: boolean,
  run: MetadataGenerationRun | undefined,
): string {
  if (!isRunView) {
    return t`Generate field metadata`;
  }
  return run != null ? getRunTitle(run.scope) : t`Field metadata generation`;
}

type GenerateMetadataFormProps = {
  databaseId: DatabaseId;
  initialTableIds?: ConcreteTableId[];
  isScopeFixed?: boolean;
  onStarted: (runId: MetadataGenerationRunId) => void;
  onCancel: () => void;
};

export function GenerateMetadataForm({
  databaseId,
  initialTableIds,
  isScopeFixed = false,
  onStarted,
  onCancel,
}: GenerateMetadataFormProps) {
  const applicationName = useSelector(getApplicationName);
  const [scopeType, setScopeType] = useState<ScopeType>(
    initialTableIds?.length ? "tables" : "database",
  );
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tableIds, setTableIds] = useState<string[]>(
    (initialTableIds ?? []).map(String),
  );
  const [attributes, setAttributes] =
    useState<MetadataGenerationAttribute[]>(DEFAULT_ATTRIBUTES);
  const [startRun, { isLoading: isStarting, error: startError }] =
    useStartMetadataGenerationRunMutation();

  // The tables and schemas are only needed to offer a scope choice.
  const { data: database, isLoading: isLoadingDatabase } =
    useGetDatabaseMetadataQuery(
      isScopeFixed
        ? skipToken
        : {
            id: databaseId,
            include_hidden: true,
            remove_inactive: true,
            skip_fields: true,
          },
    );
  const tables = useMemo(() => database?.tables ?? [], [database]);
  const schemaOptions = useMemo(
    () =>
      _.uniq(tables.map((table) => table.schema ?? ""))
        .filter((schema) => schema !== "")
        .sort(),
    [tables],
  );
  const tableOptions = useMemo(
    () =>
      _.sortBy(tables, (table) => [table.schema, table.display_name]).map(
        (table) => ({
          value: String(table.id),
          label: table.schema
            ? `${table.schema}.${table.display_name}`
            : table.display_name,
        }),
      ),
    [tables],
  );
  const scopeOptions = useMemo(
    () => getScopeOptions(schemaOptions.length > 0),
    [schemaOptions],
  );

  const request = getRunRequest(
    databaseId,
    scopeType,
    schemas,
    tableIds,
    attributes,
  );
  const {
    data: estimate,
    error: estimateError,
    isFetching: isEstimating,
  } = useGetMetadataGenerationEstimateQuery(request ?? skipToken);

  const unavailableReason = estimate?.unavailable_reason;
  const canStart =
    request != null &&
    estimate != null &&
    estimateError == null &&
    unavailableReason == null &&
    !isEstimating;

  const handleStart = async () => {
    if (request == null) {
      return;
    }
    const { data } = await startRun(request);
    if (data) {
      onStarted(data.id);
    }
  };

  const toggleAttribute = (
    attribute: MetadataGenerationAttribute,
    checked: boolean,
  ) => {
    setAttributes((current) =>
      checked
        ? ALL_ATTRIBUTES.filter((a) => a === attribute || current.includes(a))
        : current.filter((a) => a !== attribute),
    );
  };

  return (
    <Stack gap="lg" data-testid="generate-metadata-form">
      <Text size="sm" c="text-secondary">
        {t`${applicationName} sends the metadata, cached field values and up to 10 sample rows of each table to the AI provider that Metabot uses. Nothing changes until you review and accept the suggestions.`}
      </Text>

      {!isScopeFixed && (
        <Stack gap="xs">
          <Text fw="bold">{t`Scope`}</Text>
          <SegmentedControl
            data={scopeOptions}
            value={scopeType}
            onChange={setScopeType}
            aria-label={t`Scope`}
          />
        </Stack>
      )}

      {!isScopeFixed && scopeType === "schemas" && (
        <MultiSelect
          label={t`Schemas`}
          placeholder={t`Pick one or more schemas`}
          data={schemaOptions}
          value={schemas}
          onChange={setSchemas}
          searchable
          disabled={isLoadingDatabase}
        />
      )}
      {!isScopeFixed && scopeType === "tables" && (
        <MultiSelect
          label={t`Specific tables`}
          placeholder={t`Pick one or more tables`}
          data={tableOptions}
          value={tableIds}
          onChange={setTableIds}
          searchable
          disabled={isLoadingDatabase}
        />
      )}

      <Stack gap="xs">
        <Text fw="bold">{t`Generate`}</Text>
        {ALL_ATTRIBUTES.map((attribute) => (
          <Checkbox
            key={attribute}
            label={getAttributePluralLabel(attribute)}
            checked={attributes.includes(attribute)}
            onChange={(event) =>
              toggleAttribute(attribute, event.currentTarget.checked)
            }
          />
        ))}
      </Stack>

      {unavailableReason != null && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {getUnavailableMessage(unavailableReason)}
        </Alert>
      )}
      {startError != null && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {getErrorMessage(startError, t`Failed to start the run`)}
        </Alert>
      )}

      <Group justify="space-between" gap="md" wrap="nowrap">
        <EstimateSummary
          isLoading={isEstimating}
          error={estimateError}
          hasRequest={request != null}
          tableCount={estimate?.table_count}
          fieldCount={estimate?.field_count}
          totalTokens={estimate?.total_tokens}
        />
        <Group justify="flex-end" gap="sm" wrap="nowrap">
          <Button variant="default" onClick={onCancel}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={!canStart}
            loading={isStarting}
            onClick={handleStart}
          >
            {t`Start`}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

function getScopeOptions(
  hasSchemas: boolean,
): SegmentedControlItem<ScopeType>[] {
  return [
    { value: "database", label: t`Whole database` },
    ...(hasSchemas ? [{ value: "schemas" as const, label: t`Schemas` }] : []),
    { value: "tables", label: t`Specific tables` },
  ];
}

type EstimateSummaryProps = {
  isLoading: boolean;
  error: unknown;
  hasRequest: boolean;
  tableCount?: number;
  fieldCount?: number;
  totalTokens?: number;
};

function EstimateSummary({
  isLoading,
  error,
  hasRequest,
  tableCount,
  fieldCount,
  totalTokens,
}: EstimateSummaryProps) {
  if (!hasRequest) {
    return (
      <Text size="sm" c="text-secondary" ta="left">
        {t`Pick what to generate and where.`}
      </Text>
    );
  }
  if (isLoading) {
    return <Loader size="xs" />;
  }
  if (error != null) {
    return (
      <Text size="sm" c="feedback-negative" ta="left">
        {getErrorMessage(error)}
      </Text>
    );
  }
  if (tableCount == null || fieldCount == null || totalTokens == null) {
    return null;
  }
  return (
    <Text
      size="sm"
      c="text-secondary"
      ta="left"
      data-testid="generate-metadata-estimate"
    >
      {[
        ngettext(
          msgid`${tableCount} table.`,
          `${tableCount} tables.`,
          tableCount,
        ),
        ngettext(
          msgid`${fieldCount} field.`,
          `${fieldCount} fields.`,
          fieldCount,
        ),
        t`About ${formatTokens(totalTokens)} tokens.`,
      ].join(" ")}
    </Text>
  );
}

function getRunRequest(
  databaseId: DatabaseId,
  scopeType: ScopeType,
  schemas: string[],
  tableIds: string[],
  attributes: MetadataGenerationAttribute[],
): MetadataGenerationRunRequest | null {
  if (attributes.length === 0) {
    return null;
  }
  switch (scopeType) {
    case "database":
      return { database_id: databaseId, attributes };
    case "schemas":
      return schemas.length > 0
        ? { database_id: databaseId, schemas, attributes }
        : null;
    case "tables":
      return tableIds.length > 0
        ? {
            database_id: databaseId,
            table_ids: tableIds.map(Number),
            attributes,
          }
        : null;
  }
}
