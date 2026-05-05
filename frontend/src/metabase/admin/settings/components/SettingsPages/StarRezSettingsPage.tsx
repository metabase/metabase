import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import {
  useActivateStarRezWeekMutation,
  useDeleteStarRezExportMutation,
  useGetStarRezStatusQuery,
  useListStarRezExportsQuery,
  useListStarRezWeeksQuery,
  useRunStarRezExportMutation,
  useTestStarRezConnectionMutation,
  useTestStarRezDbMutation,
} from "metabase/api/starrez";
import {
  Alert,
  Badge,
  Button,
  Flex,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";

function ConfigSection() {
  const [testConnection, { isLoading: testing, data: testResult }] =
    useTestStarRezConnectionMutation();

  return (
    <SettingsSection title={t`StarRez API Connection`}>
      <Stack gap="md">
        <AdminSettingInput
          name="starrez-api-url"
          title={t`StarRez REST Base URL`}
          description={t`Full URL including the REST path, e.g. https://yourinstance.starrezhousing.com/StarRezRest`}
          placeholder="https://yourinstance.starrezhousing.com/StarRezRest"
          inputType="text"
        />

        <AdminSettingInput
          name="starrez-api-username"
          title={t`Username`}
          description={t`StarRez REST API username (e.g. SUDOLONDON)`}
          placeholder="SUDOLONDON"
          inputType="text"
        />

        <AdminSettingInput
          name="starrez-api-token"
          title={t`REST Token`}
          description={t`Used as the password for HTTP Basic Auth (stored encrypted)`}
          placeholder={t`Paste your StarRez REST token`}
          inputType="password"
        />

        <AdminSettingInput
          name="starrez-blob-sas-url"
          title={t`Azure Blob Storage SAS URL`}
          description={t`Container-level SAS URL with read, write, delete, and list permissions`}
          placeholder="https://myaccount.blob.core.windows.net/mycontainer?sv=...&sig=..."
          inputType="password"
        />

        <AdminSettingInput
          name="starrez-export-tables"
          title={t`Tables to Export`}
          description={t`Comma-separated StarRez table names (e.g. RoomBooking,Entry,Person)`}
          placeholder="RoomBooking,Entry,Person"
          inputType="text"
        />

        <AdminSettingInput
          name="starrez-export-reports"
          title={t`Reports to Export`}
          description={t`Comma-separated StarRez report IDs or names. Leave blank to skip reports.`}
          placeholder="57161,RoomAvailability"
          inputType="text"
        />

        <AdminSettingInput
          name="starrez-sort-field"
          title={t`Sort Field`}
          description={t`Field name used to sort exported records (applied client-side; ignored if the field is missing)`}
          placeholder="DateModified"
          inputType="text"
        />

        <AdminSettingInput
          name="starrez-keep-versions"
          title={t`Versions to Keep`}
          description={t`Number of past export files to retain per table (0 = keep all)`}
          placeholder="5"
          inputType="number"
        />

        <Flex gap="md" align="center">
          <Button
            variant="outline"
            onClick={() => testConnection()}
            loading={testing}
          >
            {t`Test Connection`}
          </Button>

          {testResult && (
            <Alert
              color={testResult.ok ? "green" : "red"}
              py="xs"
              px="md"
              style={{ flex: 1 }}
            >
              {testResult.ok
                ? (testResult.message ?? t`Connected successfully`)
                : (testResult.error ?? t`Connection failed`)}
            </Alert>
          )}
        </Flex>
      </Stack>
    </SettingsSection>
  );
}

function ExportSection() {
  const [runExport, { isLoading: exporting, data: exportResult }] =
    useRunStarRezExportMutation();

  return (
    <SettingsSection title={t`Export StarRez Data`}>
      <Stack gap="md">
        <Text c="text-secondary">
          {t`Pull all configured tables and reports from StarRez and upload CSV snapshots to Azure Blob Storage.`}
        </Text>

        <Flex gap="md" align="center">
          <Button variant="filled" onClick={() => runExport()} loading={exporting}>
            {t`Run Export`}
          </Button>
          {exporting && (
            <Text c="text-secondary">{t`Fetching and uploading data…`}</Text>
          )}
        </Flex>

        {exportResult?.error && (
          <Alert color="red">{exportResult.error}</Alert>
        )}

        {exportResult?.results && (
          <Stack gap="sm">
            <Title order={4}>{t`Export Results`}</Title>
            {exportResult.results.map(r => (
              <Paper key={`${r.kind}-${r.name}`} withBorder p="md">
                <Flex justify="space-between" align="center">
                  <Stack gap={4}>
                    <Group gap="sm">
                      <Badge variant="light">
                        {r.kind === "report" ? t`Report` : t`Table`}
                      </Badge>
                      <Title order={5}>{r.name}</Title>
                      <Badge color={r.success ? "green" : "red"}>
                        {r.success ? t`Success` : t`Failed`}
                      </Badge>
                    </Group>
                    <Text size="sm" c="text-secondary" ff="monospace">
                      {r.blob_name}
                    </Text>
                  </Stack>
                  {typeof r.records_count === "number" && (
                    <Text size="sm" c="text-secondary">
                      {r.records_count.toLocaleString()} {t`records`}
                    </Text>
                  )}
                </Flex>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </SettingsSection>
  );
}

function PastExportsSection() {
  const { data, isLoading, refetch } = useListStarRezExportsQuery();
  const [deleteExport, { isLoading: deleting }] =
    useDeleteStarRezExportMutation();

  const exports = data?.exports ?? [];

  return (
    <SettingsSection title={t`Past Exports in Blob Storage`}>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text c="text-secondary">
            {t`Files stored in Azure Blob Storage. Old versions are pruned automatically on each export.`}
          </Text>
          <Button variant="subtle" size="sm" onClick={() => refetch()}>
            {t`Refresh list`}
          </Button>
        </Group>

        {isLoading ? (
          <Flex justify="center" py="xl">
            <Loader />
          </Flex>
        ) : data?.error ? (
          <Alert color="red">{data.error}</Alert>
        ) : exports.length === 0 ? (
          <Text c="text-secondary">
            {t`No exports found. Run an export above to get started.`}
          </Text>
        ) : (
          <Stack gap="sm">
            {exports.map(file => (
              <Paper key={file.name} withBorder p="md">
                <Flex justify="space-between" align="center">
                  <Stack gap={4}>
                    <Text size="sm" ff="monospace">
                      {file.name}
                    </Text>
                    <Group gap="md">
                      {file.last_modified && (
                        <Text size="xs" c="text-secondary">
                          {file.last_modified}
                        </Text>
                      )}
                      {file.size && (
                        <Text size="xs" c="text-secondary">
                          {formatBytes(Number(file.size))}
                        </Text>
                      )}
                    </Group>
                  </Stack>
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    loading={deleting}
                    onClick={() => deleteExport(file.name)}
                  >
                    {t`Delete`}
                  </Button>
                </Flex>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </SettingsSection>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PostgresConfigSection() {
  const [testDb, { isLoading: testing, data: testResult }] =
    useTestStarRezDbMutation();

  return (
    <SettingsSection title={t`Postgres Database (StarRez data)`}>
      <Stack gap="md">
        <Text c="text-secondary">
          {t`Where StarRez snapshots are loaded for dashboarding. Should point at your Azure Postgres "starrez" database.`}
        </Text>

        <AdminSettingInput
          name="starrez-pg-host"
          title={t`Host`}
          description={t`e.g. yourserver.postgres.database.azure.com`}
          placeholder="yourserver.postgres.database.azure.com"
          inputType="text"
        />

        <AdminSettingInput
          name="starrez-pg-database"
          title={t`Database`}
          description={t`Name of the Postgres database`}
          placeholder="starrez"
          inputType="text"
        />

        <AdminSettingInput
          name="starrez-pg-user"
          title={t`Username`}
          placeholder="mbadmin"
          inputType="text"
        />

        <AdminSettingInput
          name="starrez-pg-password"
          title={t`Password`}
          description={t`Stored encrypted`}
          placeholder={t`Postgres password`}
          inputType="password"
        />

        <Flex gap="md" align="center">
          <Button variant="outline" onClick={() => testDb()} loading={testing}>
            {t`Test Postgres Connection`}
          </Button>
          {testResult && (
            <Alert
              color={testResult.ok ? "green" : "red"}
              py="xs"
              px="md"
              style={{ flex: 1 }}
            >
              {testResult.ok
                ? (testResult.message ?? t`Connected successfully`)
                : (testResult.error ?? t`Connection failed`)}
            </Alert>
          )}
        </Flex>
      </Stack>
    </SettingsSection>
  );
}

function WeeksSection() {
  const { data, isLoading, refetch } = useListStarRezWeeksQuery();
  const [activate, { isLoading: activating, data: activateResult }] =
    useActivateStarRezWeekMutation();

  const weeks = data?.weeks ?? [];

  return (
    <SettingsSection title={t`Snapshot Weeks`}>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text c="text-secondary">
            {t`Each export records a week. Click "Activate" to drop and reload starrez_data.* tables from that week's snapshot.`}
          </Text>
          <Button variant="subtle" size="sm" onClick={() => refetch()}>
            {t`Refresh`}
          </Button>
        </Group>

        {activateResult?.error && (
          <Alert color="red">{activateResult.error}</Alert>
        )}
        {activateResult?.results && (
          <Alert color="green">
            {t`Activated. Tables loaded: ${activateResult.results
              .map(r => `${r.table} (${r.rows.toLocaleString()} rows)`)
              .join(", ")}`}
          </Alert>
        )}

        {isLoading ? (
          <Flex justify="center" py="xl">
            <Loader />
          </Flex>
        ) : data?.error ? (
          <Alert color="red">{data.error}</Alert>
        ) : weeks.length === 0 ? (
          <Text c="text-secondary">
            {t`No snapshot weeks yet. Run an export to create one.`}
          </Text>
        ) : (
          <Stack gap="sm">
            {weeks.map(w => (
              <Paper
                key={w.id}
                withBorder
                p="md"
                style={
                  w.is_active
                    ? { borderColor: "var(--mb-color-success)" }
                    : undefined
                }
              >
                <Flex justify="space-between" align="center">
                  <Stack gap={4}>
                    <Group gap="sm">
                      <Title order={5}>
                        {t`Week of ${w.week_start}`}
                      </Title>
                      {w.is_active && (
                        <Badge color="green">{t`Active`}</Badge>
                      )}
                    </Group>
                    <Text size="xs" c="text-secondary">
                      {t`Fetched: ${w.fetched_at}`} •{" "}
                      {Object.keys(w.blob_files).length} {t`files`}
                    </Text>
                  </Stack>
                  <Button
                    variant={w.is_active ? "subtle" : "filled"}
                    size="sm"
                    loading={activating}
                    disabled={w.is_active}
                    onClick={() => activate(w.id)}
                  >
                    {w.is_active ? t`Active` : t`Activate`}
                  </Button>
                </Flex>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </SettingsSection>
  );
}

export function StarRezSettingsPage() {
  const { data: status } = useGetStarRezStatusQuery();

  const allConfigured =
    status?.configured.api_url &&
    status?.configured.api_username &&
    status?.configured.api_token &&
    status?.configured.blob_sas_url &&
    status?.configured.pg_host &&
    status?.configured.pg_user &&
    status?.configured.pg_password;

  return (
    <SettingsPageWrapper
      title={t`StarRez Export`}
      description={t`Connect to your StarRez housing management system and export data to Azure Blob Storage for reporting and archiving.`}
    >
      {status && !allConfigured && (
        <Alert color="yellow" mb="lg">
          {t`Complete all configuration fields below before running an export.`}
        </Alert>
      )}

      <ConfigSection />
      <PostgresConfigSection />
      <ExportSection />
      <WeeksSection />
      <PastExportsSection />
    </SettingsPageWrapper>
  );
}
