import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  skipToken,
  useListDatabasesQuery,
  useListSyncableDatabaseSchemasQuery,
} from "metabase/api";
import { getErrorMessage, useAdminSetting } from "metabase/api/utils";
import {
  ActionButton,
  type ActionButtonHandle,
} from "metabase/common/components/ActionButton";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting, useToast } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import {
  Alert,
  Box,
  Flex,
  Group,
  Icon,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import type {
  Database,
  SettingKey,
  SettingValue,
  UploadsSettings,
} from "metabase-types/api";

import { SettingHeader } from "../SettingHeader";

import { dbHasSchema, getDatabaseOptions, getSchemaOptions } from "./utils";

const FEEDBACK_TIMEOUT = 5000;
// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
const enableErrorMessage = t`There was a problem enabling uploads. Please try again shortly.`;
// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
const disableErrorMessage = t`There was a problem disabling uploads. Please try again shortly.`;

export function UploadSettingsFormView({
  databases,
  uploadsSettings,
  updateSetting,
}: {
  databases: Database[];
  uploadsSettings: UploadsSettings;
  updateSetting: ({
    key,
    value,
    toast,
  }: {
    key: SettingKey;
    value: SettingValue;
    toast?: boolean;
  }) => Promise<any>;
}) {
  const [dbId, setDbId] = useState<number | null>(
    uploadsSettings.db_id ?? null,
  );
  const [schemaName, setSchemaName] = useState<string | null>(
    uploadsSettings.schema_name ?? null,
  );
  const [tablePrefix, setTablePrefix] = useState<string | null>(
    uploadsSettings.table_prefix ?? null,
  );

  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [sendToast] = useToast();

  const showSchema = Boolean(dbId && dbHasSchema(databases, dbId));
  const databaseOptions = getDatabaseOptions(databases);

  const isHosted = useSetting("is-hosted?");

  const enableButtonRef = useRef<ActionButtonHandle>(null);
  const disableButtonRef = useRef<ActionButtonHandle>(null);
  const updateButtonRef = useRef<ActionButtonHandle>(null);

  const resetButtons = () => {
    enableButtonRef?.current?.resetState();
    disableButtonRef?.current?.resetState();
    updateButtonRef?.current?.resetState();
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), FEEDBACK_TIMEOUT);
    sendToast({ icon: "warning", message: msg });
  };

  const handleEnableUploads = async () => {
    return updateSetting({
      key: "uploads-settings",
      value: {
        db_id: dbId,
        schema_name: schemaName,
        table_prefix: tablePrefix,
      },
      toast: false,
    }).then((response) => {
      if (response.error) {
        showError(getErrorMessage(enableErrorMessage));
        throw new Error(t`Error enabling uploads`);
      }

      sendToast({ message: t`Uploads enabled` });
    });
  };

  const handleDisableUploads = () => {
    return updateSetting({
      key: "uploads-settings",
      value: {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
      toast: false,
    }).then((response) => {
      if (response.error) {
        showError(getErrorMessage(disableErrorMessage));
        throw new Error(t`Error disabling uploads`);
      }
      setDbId(null);
      setSchemaName(null);
      setTablePrefix(null);
      sendToast({ message: t`Uploads disabled` });
    });
  };

  const showPrefix = !!dbId;
  const hasValidSettings = Boolean(dbId && (!showSchema || schemaName));
  const settingsChanged =
    dbId !== uploadsSettings.db_id ||
    schemaName !== uploadsSettings.schema_name ||
    tablePrefix !== uploadsSettings.table_prefix;

  const hasValidDatabases = databaseOptions.length > 0;
  const isH2db = Boolean(
    dbId && databases.find((db) => db.id === dbId)?.engine === "h2",
  );

  const {
    data: schemas,
    error: schemasError,
    isFetching: schemasIsFetching,
  } = useListSyncableDatabaseSchemasQuery(
    showSchema && dbId != null ? dbId : skipToken,
  );

  return (
    <Box component="form" aria-label={t`Upload Settings Form`} px="md">
      <SettingHeader
        id="upload-settings"
        title={t`Allow people to upload data to collections`}
        description={jt`People will be able to upload CSV files that will be stored in the ${(
          <Link
            className={CS.link}
            key="db-link"
            to="/admin/databases"
          >{t`database`}</Link>
        )} you choose and turned into models.`}
      />
      {isH2db && <H2PersistenceWarning isHosted={isHosted} />}
      <Group align="flex-start">
        <Select
          label={t`Database to use for uploads`}
          value={dbId ? String(dbId) : null}
          placeholder={t`Select a database`}
          disabled={!hasValidDatabases}
          data={databaseOptions}
          onChange={(newValue) => {
            const newDbId = Number(newValue);
            setDbId(newDbId);
            if (newDbId) {
              resetButtons();
              setSchemaName(null);
            }
          }}
        />

        {showSchema && (
          <Select
            label={t`Schema`}
            maw="12rem"
            disabled={Boolean(
              schemasError || schemasIsFetching || !schemas?.length,
            )}
            value={schemaName}
            placeholder={t`Select a schema`}
            data={getSchemaOptions(schemas ?? [])}
            onChange={(newValue) => {
              resetButtons();
              setSchemaName(newValue);
            }}
            error={match({
              schemasError: !!schemasError,
              schemaLength: !!schemas?.length,
            })
              .with({ schemasError: true }, () =>
                getErrorMessage((schemasError as any)?.data),
              )
              .with(
                { schemaLength: false },
                () => t`We couldn't find any schema`,
              )
              .otherwise(() => undefined)}
          />
        )}

        {showPrefix && (
          <TextInput
            label={t`Upload Table Prefix (optional)`}
            value={tablePrefix ?? ""}
            placeholder={t`upload_`}
            onChange={(e) => {
              resetButtons();
              setTablePrefix(e.target.value);
            }}
          />
        )}
      </Group>
      <Flex mt="lg">
        {uploadsSettings.db_id ? (
          settingsChanged ? (
            <ActionButton
              ref={updateButtonRef}
              normalText={t`Update settings`}
              successText={t`Settings updated`}
              disabled={!hasValidSettings}
              failedText={t`Failed to save upload settings`}
              actionFn={handleEnableUploads}
              primary
              useLoadingSpinner
              type="submit"
            />
          ) : (
            <ActionButton
              ref={disableButtonRef}
              normalText={t`Disable uploads`}
              successText={
                t`Uploads enabled` /* yes, this is backwards intentionally */
              }
              failedText={t`Failed to disable uploads`}
              actionFn={handleDisableUploads}
              type="button"
              danger
              useLoadingSpinner
            />
          )
        ) : (
          <ActionButton
            ref={enableButtonRef}
            normalText={t`Enable uploads`}
            successText={
              t`Uploads disabled` /* yes, this is backwards intentionally */
            }
            failedText={t`Failed to enable uploads`}
            actionFn={handleEnableUploads}
            primary={!!hasValidSettings}
            disabled={!hasValidSettings || !hasValidDatabases}
            useLoadingSpinner
            type="submit"
          />
        )}
      </Flex>
      {!hasValidDatabases && <NoValidDatabasesMessage />}
      {errorMessage && (
        <Text c="danger" mt="md">
          {errorMessage}
        </Text>
      )}
    </Box>
  );
}

const H2PersistenceWarning = ({ isHosted }: { isHosted: boolean }) => (
  <Stack my="md" maw={620}>
    <Alert icon={<Icon name="warning" />} color="warning">
      <Text>
        {t`Warning: uploads to the Sample Database are for testing only and may disappear. If you want your data to stick around, you should upload to a PostgreSQL, MySQL, Redshift or Clickhouse database.`}
      </Text>
      {isHosted && (
        <Tooltip
          label={
            <>
              <Text mb="md" c="inherit">
                {t`By enabling uploads to the Sample Database, you agree that you will not upload or otherwise transmit any individually identifiable information, including without limitation Personal Data (as defined by the General Data Protection Regulation) or Personally Identifiable Information (as defined by the California Consumer Privacy Act and California Privacy Rights Act).`}
              </Text>
              <Text c="inherit">
                {t`Additionally, you acknowledge and agree that the ability to upload to the Sample Database is provided “as is” and without warranty of any kind, and Metabase disclaims all warranties, express or implied, and all liability in connection with the uploads to the Sample Database or the data stored within it.`}
              </Text>
            </>
          }
          position="bottom"
          multiline
          maw="30rem"
        >
          <Text
            component="span"
            td="underline"
            fw={700}
          >{t`Additional terms apply.`}</Text>
        </Tooltip>
      )}
    </Alert>
  </Stack>
);

const NoValidDatabasesMessage = () => (
  <>
    <p>
      {t`None of your databases are compatible with this version of the uploads feature.`}
    </p>
    <p>
      {jt`Metabase currently supports ${(
        <strong key="db-types">{t`Postgres, MySQL, and H2`}</strong>
      )} for uploads and needs a connection with write privileges.`}
    </p>
  </>
);

export const UploadSettingsForm = () => {
  const {
    value: uploadsSettings,
    updateSetting,
    isLoading: isLoadingSettings,
  } = useAdminSetting("uploads-settings");
  const { data: databaseResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery({ include_only_uploadable: true });

  if (
    isLoadingSettings ||
    isLoadingDatabases ||
    !uploadsSettings ||
    !databaseResponse
  ) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <UploadSettingsFormView
      databases={databaseResponse.data}
      uploadsSettings={uploadsSettings}
      updateSetting={updateSetting}
    />
  );
};
