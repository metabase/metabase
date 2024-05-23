import type * as React from "react";
import { useState, useRef } from "react";
import { connect } from "react-redux";
import { jt, t } from "ttag";
import _ from "underscore";

import { updateSettings } from "metabase/admin/settings/settings";
import ActionButton from "metabase/components/ActionButton";
import EmptyState from "metabase/components/EmptyState/EmptyState";
import Alert from "metabase/core/components/Alert";
import Input from "metabase/core/components/Input";
import Link from "metabase/core/components/Link";
import type { SelectChangeEvent } from "metabase/core/components/Select";
import Select from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import { useDispatch } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Stack, Group, Text } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type { UploadsSettings } from "metabase-types/api/settings";
import type { State } from "metabase-types/store";

import SettingHeader from "../SettingHeader";

import { SectionTitle, ColorText, PaddedForm } from "./UploadSetting.styled";
import { getDatabaseOptions, getSchemaOptions, dbHasSchema } from "./utils";

const FEEDBACK_TIMEOUT = 5000;
const enableErrorMessage = t`There was a problem enabling uploads. Please try again shortly.`;
const disableErrorMessage = t`There was a problem disabling uploads. Please try again shortly.`;

interface UploadSettingProps {
  databases: Database[];
  uploadsSettings: UploadsSettings;
  updateSettings: (
    settings: Record<
      string,
      string | number | boolean | UploadsSettings | null
    >,
  ) => Promise<void>;
  saveStatusRef: React.RefObject<{
    setSaving: () => void;
    setSaved: () => void;
    setSaveError: (msg: string) => void;
    clear: () => void;
  }>;
}

const mapStateToProps = (state: State) => ({
  uploadsSettings: getSetting(state, "uploads-settings"),
});

const mapDispatchToProps = {
  updateSettings,
};

const Header = () => (
  <SettingHeader
    id="upload-settings"
    setting={{
      display_name: t`Allow people to upload data to Collections`,
      description: jt`People will be able to upload CSV files that will be stored in the ${(
        <Link
          className={CS.link}
          key="db-link"
          to="/admin/databases"
        >{t`database`}</Link>
      )} you choose and turned into models.`,
    }}
  />
);

export function UploadSettingsFormView({
  databases,
  uploadsSettings,
  updateSettings,
  saveStatusRef,
}: UploadSettingProps) {
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
  const dispatch = useDispatch();

  const showSchema = Boolean(dbId && dbHasSchema(databases, dbId));
  const databaseOptions = getDatabaseOptions(databases);

  const enableButtonRef = useRef<ActionButton>(null);
  const disableButtonRef = useRef<ActionButton>(null);
  const updateButtonRef = useRef<ActionButton>(null);

  const resetButtons = () => {
    enableButtonRef?.current?.resetState();
    disableButtonRef?.current?.resetState();
    updateButtonRef?.current?.resetState();
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), FEEDBACK_TIMEOUT);
    saveStatusRef?.current?.clear();
  };

  const showSaving = () => {
    saveStatusRef?.current?.setSaving();
  };

  const handleEnableUploads = async () => {
    showSaving();
    return updateSettings({
      "uploads-settings": {
        db_id: dbId,
        schema_name: schemaName,
        table_prefix: tablePrefix,
      },
    })
      .then(() => {
        setSchemaName(schemaName);
        setTablePrefix(tablePrefix);
        saveStatusRef?.current?.setSaved();
        dispatch(Databases.actions.invalidateLists());
      })
      .catch(() => showError(enableErrorMessage));
  };

  const handleDisableUploads = () => {
    showSaving();
    return updateSettings({
      "uploads-settings": {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
    })
      .then(() => {
        setDbId(null);
        setSchemaName(null);
        setTablePrefix(null);
        saveStatusRef?.current?.setSaved();
      })
      .catch(() => showError(disableErrorMessage));
  };

  const showPrefix = !!dbId;
  const hasValidSettings = Boolean(dbId && (!showSchema || schemaName));
  const settingsChanged =
    dbId !== uploadsSettings.db_id ||
    schemaName !== uploadsSettings.schema_name ||
    tablePrefix !== uploadsSettings.table_prefix;

  const hasValidDatabases = databaseOptions.length > 0;
  const isH2db = Boolean(
    dbId && databases.find(db => db.id === dbId)?.engine === "h2",
  );

  return (
    <PaddedForm aria-label={t`Upload Settings Form`}>
      <Header />
      {isH2db && <H2PersistenceWarning />}
      <Group>
        <Stack>
          <SectionTitle>{t`Database to use for uploads`}</SectionTitle>
          <Select
            value={dbId ?? 0}
            placeholder={t`Select a database`}
            disabled={!hasValidDatabases}
            options={databaseOptions}
            onChange={(e: SelectChangeEvent<number>) => {
              setDbId(e.target.value);
              if (e.target.value) {
                resetButtons();
                dbHasSchema(databases, e.target.value)
                  ? setTablePrefix(null)
                  : setTablePrefix("upload_");
                setSchemaName(null);
              }
            }}
          />
        </Stack>
        {showSchema && (
          <Schemas.ListLoader query={{ dbId, getAll: true }}>
            {({ list: schemaList }: { list: Schema[] }) => (
              <Stack>
                <SectionTitle>{t`Schema`}</SectionTitle>
                {schemaList?.length ? (
                  <Select
                    value={schemaName ?? ""}
                    placeholder={t`Select a schema`}
                    options={getSchemaOptions(schemaList)}
                    onChange={(e: SelectChangeEvent<string>) => {
                      resetButtons();
                      setSchemaName(e.target.value);
                    }}
                  />
                ) : (
                  <EmptyState message={t`We couldn't find any schema.`} />
                )}
              </Stack>
            )}
          </Schemas.ListLoader>
        )}
        {showPrefix && (
          <Stack>
            <SectionTitle>{t`Upload Table Prefix (optional)`}</SectionTitle>
            <Input
              value={tablePrefix ?? ""}
              placeholder={t`upload_`}
              onChange={e => {
                resetButtons();
                setTablePrefix(e.target.value);
              }}
            />
          </Stack>
        )}
      </Group>
      <Group mt="lg">
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
      </Group>
      {!hasValidDatabases && <NoValidDatabasesMessage />}
      {errorMessage && <ColorText color="danger">{errorMessage}</ColorText>}
    </PaddedForm>
  );
}

const H2PersistenceWarning = () => (
  <Stack my="md" maw={620}>
    <Alert icon="warning" variant="warning">
      <Text>
        {t`Warning: uploads to the Sample Database are for testing only and may disappear. If you want your data to stick around, you should upload to a PostgreSQL or MySQL database.`}
      </Text>
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

export const UploadSettingsForm = _.compose(
  Databases.loadList({ query: { include_only_uploadable: true } }),
  connect(mapStateToProps, mapDispatchToProps),
)(UploadSettingsFormView);
