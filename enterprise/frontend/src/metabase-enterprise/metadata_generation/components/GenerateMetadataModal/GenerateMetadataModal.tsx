import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { skipToken, useGetDatabaseMetadataQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Icon,
  Loader,
  Modal,
  MultiSelect,
  Radio,
  Stack,
  Text,
} from "metabase/ui";
import {
  useGetMetadataGenerationEstimateQuery,
  useStartMetadataGenerationRunMutation,
} from "metabase-enterprise/api";
import type {
  ConcreteTableId,
  DatabaseId,
  MetadataGenerationAttribute,
  MetadataGenerationRunId,
  MetadataGenerationRunRequest,
} from "metabase-types/api";

import {
  DEFAULT_ATTRIBUTES,
  formatCost,
  formatTokens,
  getAttributeLabel,
  getUnavailableMessage,
} from "../../utils";
import { RunProgress } from "../RunProgress";

const ALL_ATTRIBUTES: MetadataGenerationAttribute[] = [
  "data_sensitivity",
  "semantic_type",
  "description",
];

const SCOPE_TYPES = ["database", "schemas", "tables"] as const;

type ScopeType = (typeof SCOPE_TYPES)[number];

function isScopeType(value: string): value is ScopeType {
  return SCOPE_TYPES.some((scopeType) => scopeType === value);
}

type GenerateMetadataModalProps = {
  databaseId: DatabaseId;
  initialTableIds?: ConcreteTableId[];
  opened: boolean;
  onClose: () => void;
};

export function GenerateMetadataModal({
  databaseId,
  initialTableIds,
  opened,
  onClose,
}: GenerateMetadataModalProps) {
  const [runId, setRunId] = useState<MetadataGenerationRunId | null>(null);

  const handleClose = () => {
    setRunId(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      title={runId == null ? t`Generate metadata` : t`Generating metadata`}
      size="lg"
      onClose={handleClose}
    >
      {runId == null ? (
        <GenerateMetadataForm
          databaseId={databaseId}
          initialTableIds={initialTableIds}
          onStarted={setRunId}
          onCancel={handleClose}
        />
      ) : (
        <Stack gap="lg">
          <RunProgress runId={runId} onRetry={(run) => setRunId(run.id)} />
          <Text size="sm" c="text-secondary">
            {t`The run continues in the background if you close this window. Its status shows on the database page.`}
          </Text>
          <Group justify="flex-end">
            <Button onClick={handleClose}>{t`Close`}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

type GenerateMetadataFormProps = {
  databaseId: DatabaseId;
  initialTableIds?: ConcreteTableId[];
  onStarted: (runId: MetadataGenerationRunId) => void;
  onCancel: () => void;
};

export function GenerateMetadataForm({
  databaseId,
  initialTableIds,
  onStarted,
  onCancel,
}: GenerateMetadataFormProps) {
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

  const { data: database, isLoading: isLoadingDatabase } =
    useGetDatabaseMetadataQuery({
      id: databaseId,
      include_hidden: true,
      remove_inactive: true,
      skip_fields: true,
    });
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
        {t`An AI model reads the metadata, sample values and a few rows of each table and proposes values. Nothing changes until you review and accept the proposals.`}
      </Text>

      <Radio.Group
        label={t`Scope`}
        value={scopeType}
        onChange={(value) => {
          if (isScopeType(value)) {
            setScopeType(value);
          }
        }}
      >
        <Group mt="xs" gap="lg">
          <Radio value="database" label={t`Whole database`} />
          {schemaOptions.length > 0 && (
            <Radio value="schemas" label={t`Schemas`} />
          )}
          <Radio value="tables" label={t`Tables`} />
        </Group>
      </Radio.Group>

      {scopeType === "schemas" && (
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
      {scopeType === "tables" && (
        <MultiSelect
          label={t`Tables`}
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
            label={getAttributeLabel(attribute)}
            checked={attributes.includes(attribute)}
            onChange={(event) =>
              toggleAttribute(attribute, event.currentTarget.checked)
            }
          />
        ))}
      </Stack>

      <EstimateSummary
        isLoading={isEstimating}
        error={estimateError}
        hasRequest={request != null}
        tableCount={estimate?.table_count}
        fieldCount={estimate?.field_count}
        totalTokens={estimate?.total_tokens}
        costUsd={estimate?.cost_usd}
      />

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

      <Group justify="flex-end" gap="sm">
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
    </Stack>
  );
}

type EstimateSummaryProps = {
  isLoading: boolean;
  error: unknown;
  hasRequest: boolean;
  tableCount?: number;
  fieldCount?: number;
  totalTokens?: number;
  costUsd?: number;
};

function EstimateSummary({
  isLoading,
  error,
  hasRequest,
  tableCount,
  fieldCount,
  totalTokens,
  costUsd,
}: EstimateSummaryProps) {
  if (!hasRequest) {
    return (
      <Text size="sm" c="text-secondary">
        {t`Pick what to generate and where.`}
      </Text>
    );
  }
  if (isLoading) {
    return <Loader size="xs" />;
  }
  if (error != null) {
    return (
      <Text size="sm" c="error">
        {getErrorMessage(error)}
      </Text>
    );
  }
  if (
    tableCount == null ||
    fieldCount == null ||
    totalTokens == null ||
    costUsd == null
  ) {
    return null;
  }
  return (
    <Text size="sm" data-testid="generate-metadata-estimate">
      {ngettext(msgid`${tableCount} table`, `${tableCount} tables`, tableCount)}
      {", "}
      {ngettext(msgid`${fieldCount} field`, `${fieldCount} fields`, fieldCount)}
      {". "}
      {t`About ${formatTokens(totalTokens)} tokens, about ${formatCost(costUsd)}.`}
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
