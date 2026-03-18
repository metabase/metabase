import { type ChangeEvent, useEffect, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useAdminSetting } from "metabase/api/utils/settings";
import { useSetting } from "metabase/common/hooks";
import { parseConnectionUriRegex } from "metabase/databases/components/DatabaseConnectionUri/parse-connection-regex";
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  PasswordInput,
  Progress,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";
import {
  useGetSemanticSearchStatusQuery,
  useReInitSemanticSearchMutation,
} from "metabase-enterprise/api";

type PgvectorConnectionFields = {
  connectionString: string;
  host: string;
  port: number | string;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
};

export function MetabotSemanticSearchSection() {
  const enabled = useSetting("ee-ai-metabot-configured?");
  const {
    value: pgvectorDbUrl,
    updateSetting,
    updateSettingResult,
  } = useAdminSetting("ee-pgvector-db-url");
  const [reInitSemanticSearch, reInitSemanticSearchResult] =
    useReInitSemanticSearchMutation();
  const [connectionFields, setConnectionFields] =
    useState<PgvectorConnectionFields>(() =>
      getInitialPgvectorConnectionFields(pgvectorDbUrl),
    );
  const [connectionStringStatus, setConnectionStringStatus] = useState<
    "success" | "failure" | null
  >(null);

  const [isIndexing, setIsIndexing] = useState<boolean>(true);

  const semanticSearchStatus = useGetSemanticSearchStatusQuery(undefined, {
    pollingInterval: 5000,
    skip: !enabled || !isIndexing,
  });

  const indexedCount = semanticSearchStatus.data?.indexed_count;
  const totalEstimate = semanticSearchStatus.data?.total_est;

  // Effect is needed because of the circular dependency
  useEffect(() => {
    if (indexedCount !== undefined && totalEstimate !== undefined) {
      setIsIndexing(indexedCount < totalEstimate);
    }
  }, [indexedCount, totalEstimate]);

  const indexingProgress =
    indexedCount !== undefined &&
    totalEstimate !== undefined &&
    totalEstimate > 0
      ? Math.min(Math.round((indexedCount / totalEstimate) * 100), 100)
      : 0;

  const isIndexingComplete =
    indexedCount !== undefined &&
    totalEstimate !== undefined &&
    indexedCount === totalEstimate;

  const handleSubmitDatabase = async () => {
    const jdbcUrl = getPgvectorJdbcUrl(connectionFields);

    try {
      await updateSetting({
        key: "ee-pgvector-db-url",
        value: jdbcUrl,
      });

      await reInitSemanticSearch().unwrap();
      semanticSearchStatus.refetch();
    } catch {
      // TODO?
    }
  };

  const handleConnectionStringChange = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const connectionString = event.target.value;

    setConnectionFields((previous) => ({
      ...previous,
      connectionString,
    }));

    if (!connectionString.trim()) {
      setConnectionStringStatus(null);
      return;
    }

    const parsed = parseConnectionUriRegex(connectionString, "postgres");

    if (!parsed) {
      setConnectionStringStatus("failure");
      return;
    }

    setConnectionFields((previous) => ({
      ...previous,
      connectionString,
      host: parsed.host ?? previous.host,
      port: parsed.port ?? previous.port,
      database: parsed.database ?? previous.database,
      username: parsed.username ?? previous.username,
      password: parsed.password ?? previous.password,
      ssl: parsed.params?.sslmode
        ? parsed.params.sslmode !== "disable"
        : parsed.params?.ssl === "true"
          ? true
          : previous.ssl,
    }));
    setConnectionStringStatus("success");
  };

  const isFormValid =
    connectionFields.host &&
    connectionFields.database &&
    connectionFields.username &&
    connectionFields.password;
  const statusError = semanticSearchStatus.error
    ? getErrorMessage(
        semanticSearchStatus,
        t`Unable to fetch semantic search indexing status.`,
      )
    : null;
  const submitError = reInitSemanticSearchResult.error
    ? getErrorMessage(
        reInitSemanticSearchResult,
        t`Unable to initialize semantic search indexing.`,
      )
    : null;

  if (!enabled) {
    return (
      <Alert color="info" variant="light">
        <Text size="sm" c="text-secondary">
          {t`Complete the provider setup to enable semantic search configuration.`}
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Stack gap="md">
        <Text size="sm" c="text-secondary">
          {t`Connect to a PostgreSQL database with pgvector extension to store embeddings for semantic search.`}
        </Text>

        <Textarea
          label={t`Connection string`}
          description={getConnectionStringDescription(connectionStringStatus)}
          placeholder="jdbc:postgresql://localhost:5432/mb_semantic_search?user=postgres&password=postgres"
          value={connectionFields.connectionString}
          onChange={handleConnectionStringChange}
        />

        <Group grow align="flex-start">
          <TextInput
            label={t`Host`}
            placeholder="localhost"
            value={connectionFields.host}
            onChange={(event) =>
              setConnectionFields((previous) => ({
                ...previous,
                host: event.target.value,
              }))
            }
            required
          />
          <NumberInput
            label={t`Port`}
            placeholder="5432"
            value={connectionFields.port}
            onChange={(value) =>
              setConnectionFields((previous) => ({
                ...previous,
                port: value ?? "",
              }))
            }
            min={1}
            max={65535}
          />
        </Group>

        <TextInput
          label={t`Database name`}
          placeholder="mb_semantic_search"
          value={connectionFields.database}
          onChange={(event) =>
            setConnectionFields((previous) => ({
              ...previous,
              database: event.target.value,
            }))
          }
          required
        />

        <TextInput
          label={t`Username`}
          placeholder="postgres"
          value={connectionFields.username}
          onChange={(event) =>
            setConnectionFields((previous) => ({
              ...previous,
              username: event.target.value,
            }))
          }
          required
        />

        <PasswordInput
          label={t`Password`}
          placeholder={t`Enter password`}
          value={connectionFields.password}
          onChange={(event) =>
            setConnectionFields((previous) => ({
              ...previous,
              password: event.target.value,
            }))
          }
          required
        />

        <Text size="sm" c="text-secondary">
          {connectionFields.ssl
            ? t`SSL is enabled and will be saved as sslmode=require.`
            : t`SSL is disabled and will be saved as sslmode=disable.`}
        </Text>

        <Group gap="sm">
          <Button
            onClick={handleSubmitDatabase}
            disabled={!isFormValid}
            loading={
              updateSettingResult.isLoading ||
              reInitSemanticSearchResult.isLoading
            }
          >
            {t`Connect and Start Indexing`}
          </Button>
        </Group>

        {submitError && <Text c="error">{submitError}</Text>}
      </Stack>

      <Stack gap="md">
        <Group justify="space-between">
          <Text fw="bold">
            {isIndexingComplete
              ? t`Indexing complete`
              : t`Indexing in progress`}
          </Text>
          <Badge color="brand" variant="light">
            {`${indexingProgress}%`}
          </Badge>
        </Group>
        <Progress
          value={indexingProgress}
          size="lg"
          animated={!isIndexingComplete}
        />
        <Text size="sm" c="text-secondary">
          {isIndexingComplete
            ? t`Your data is ready for semantic search.`
            : t`Creating embeddings for your data. This runs in the background. You can continue using Metabot with keyword search while indexing completes.`}
        </Text>
        <Text size="sm" c="text-secondary">
          {totalEstimate !== undefined
            ? t`${indexedCount} of ${totalEstimate} items indexed`
            : t`Waiting for indexing status…`}
        </Text>
        {statusError && <Text c="error">{statusError}</Text>}
      </Stack>
    </Stack>
  );
}

function getPgvectorJdbcUrl(fields: PgvectorConnectionFields) {
  const params = new URLSearchParams();

  if (fields.username) {
    params.set("user", fields.username);
  }

  if (fields.password) {
    params.set("password", fields.password);
  }

  params.set("sslmode", fields.ssl ? "require" : "disable");

  const host = fields.host || "localhost";
  const port = fields.port ? String(fields.port) : "5432";
  const dbname = fields.database;
  const query = params.toString();

  return `jdbc:postgresql://${host}:${port}/${dbname}${query ? `?${query}` : ""}`;
}

function getInitialPgvectorConnectionFields(
  pgvectorDbUrl: string | null | undefined,
) {
  const parsed = parseConnectionUriRegex(
    pgvectorDbUrl ?? undefined,
    "postgres",
  );

  return {
    connectionString: pgvectorDbUrl ?? "",
    host: parsed?.host ?? "",
    port: parsed?.port ?? 5432,
    database: parsed?.database ?? "",
    username: parsed?.username ?? "",
    password: parsed?.password ?? "",
    ssl:
      parsed?.params?.sslmode != null
        ? parsed.params.sslmode !== "disable"
        : parsed?.params?.ssl === "true",
  } satisfies PgvectorConnectionFields;
}

function getConnectionStringDescription(status: "success" | "failure" | null) {
  if (status === "success") {
    return t`Connection details pre-filled below.`;
  }

  if (status === "failure") {
    return t`Couldn’t use this connection string. Paste a PostgreSQL JDBC URL.`;
  }

  return t`You can use a PostgreSQL JDBC connection string to pre-fill the fields below.`;
}
