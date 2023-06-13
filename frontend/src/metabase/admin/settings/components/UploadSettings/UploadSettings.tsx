import { useState, useRef } from "react";

import * as React from "react";
import { jt, t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";

import { getSetting } from "metabase/selectors/settings";
import { updateSettings } from "metabase/admin/settings/settings";

import type { State } from "metabase-types/store";

import Link from "metabase/core/components/Link";
import Select, { SelectChangeEvent } from "metabase/core/components/Select";
import Input from "metabase/core/components/Input";
import ActionButton from "metabase/components/ActionButton";
import EmptyState from "metabase/components/EmptyState/EmptyState";

import Database from "metabase-lib/metadata/Database";
import Schema from "metabase-lib/metadata/Schema";

import SettingHeader from "../SettingHeader";
import {
  FlexContainer,
  SectionTitle,
  ColorText,
  PaddedForm,
} from "./UploadSetting.styled";
import { getDatabaseOptions, getSchemaOptions, dbHasSchema } from "./utils";

const FEEDBACK_TIMEOUT = 5000;
const enableErrorMessage = t`There was a problem enabling uploads. Please try again shortly.`;
const disableErrorMessage = t`There was a problem disabling uploads. Please try again shortly.`;

export interface UploadSettings {
  uploads_enabled: boolean;
  uploads_database_id: number | null;
  uploads_schema_name: string | null;
  uploads_table_prefix: string | null;
}

export interface UploadSettingProps {
  databases: Database[];
  settings: UploadSettings;
  updateSettings: (
    settings: Record<string, string | number | boolean | null>,
  ) => Promise<void>;
  saveStatusRef: React.RefObject<{
    setSaving: () => void;
    setSaved: () => void;
    setSaveError: (msg: string) => void;
    clear: () => void;
  }>;
}

const mapStateToProps = (state: State) => ({
  settings: {
    uploads_enabled: getSetting(state, "uploads-enabled"),
    uploads_database_id: getSetting(state, "uploads-database-id"),
    uploads_schema_name: getSetting(state, "uploads-schema-name"),
    uploads_table_prefix: getSetting(state, "uploads-table-prefix"),
  },
});

const mapDispatchToProps = {
  updateSettings,
};

const Header = () => (
  <SettingHeader
    id="upload-settings"
    setting={{
      display_name: t`Allow users to upload data to Collections`,
      description: jt`Users will be able to upload CSV files that will be stored in the ${(
        <Link
          className="link"
          key="db-link"
          to="/admin/databases"
        >{t`database`}</Link>
      )} you choose and turned into models.`,
    }}
  />
);

export function UploadSettingsView({
  databases,
  settings,
  updateSettings,
  saveStatusRef,
}: UploadSettingProps) {
  const [dbId, setDbId] = useState<number | null>(
    settings.uploads_database_id ?? null,
  );
  const [schemaName, setSchemaName] = useState<string | null>(
    settings.uploads_schema_name ?? null,
  );
  const [tablePrefix, setTablePrefix] = useState<string | null>(
    settings.uploads_table_prefix ?? null,
  );
  const [errorMessage, setErrorMessage] = useState<null | string>(null);

  const showSchema = dbId && dbHasSchema(databases, dbId);
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
      "uploads-enabled": true,
      "uploads-database-id": dbId,
      "uploads-schema-name": schemaName,
      "uploads-table-prefix": tablePrefix,
    })
      .then(() => {
        setSchemaName(schemaName);
        setTablePrefix(tablePrefix);
        saveStatusRef?.current?.setSaved();
      })
      .catch(() => showError(enableErrorMessage));
  };

  const handleDisableUploads = () => {
    showSaving();
    return updateSettings({
      "uploads-enabled": false,
      "uploads-database-id": null,
      "uploads-schema-name": null,
      "uploads-table-prefix": null,
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
    dbId !== settings.uploads_database_id ||
    schemaName !== settings.uploads_schema_name ||
    tablePrefix !== settings.uploads_table_prefix;

  const hasValidDatabases = databaseOptions.length > 0;

  return (
    <PaddedForm aria-label={t`Upload Settings Form`}>
      <Header />
      <FlexContainer>
        <div>
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
        </div>
        {!!showSchema && (
          <Schemas.ListLoader query={{ dbId, getAll: true }}>
            {({ list: schemaList }: { list: Schema[] }) => (
              <div>
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
              </div>
            )}
          </Schemas.ListLoader>
        )}
        {!!showPrefix && (
          <div>
            <SectionTitle>{t`Upload Table Prefix (optional)`}</SectionTitle>
            <Input
              value={tablePrefix ?? ""}
              placeholder={t`upload_`}
              onChange={e => {
                resetButtons();
                setTablePrefix(e.target.value);
              }}
            />
          </div>
        )}
      </FlexContainer>
      <FlexContainer>
        {settings.uploads_enabled ? (
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
      </FlexContainer>
      {!hasValidDatabases && <NoValidDatabasesMessage />}
      {errorMessage && <ColorText color="danger">{errorMessage}</ColorText>}
    </PaddedForm>
  );
}

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

export const UploadSettings = _.compose(
  Databases.loadList({ query: { include_only_uploadable: true } }),
  connect(mapStateToProps, mapDispatchToProps),
)(UploadSettingsView);
