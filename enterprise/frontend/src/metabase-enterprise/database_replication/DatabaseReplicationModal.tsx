import { useCallback, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Modal, type ModalProps } from "metabase/ui";
import {
  type PreviewDatabaseReplicationResponse,
  useCreateDatabaseReplicationMutation,
  usePreviewDatabaseReplicationMutation,
} from "metabase-enterprise/api/database-replication";
import type { Database } from "metabase-types/api";

import { DatabaseReplicationError } from "./DatabaseReplicationError";
import {
  DatabaseReplicationForm,
  type DatabaseReplicationFormFields,
} from "./DatabaseReplicationForm";
import {
  DatabaseReplicationSettingUp,
  getDatabaseReplicationSettingUpModalProps,
} from "./DatabaseReplicationSettingUp";
import {
  DatabaseReplicationSuccess,
  getDatabaseReplicationSuccessModalProps,
} from "./DatabaseReplicationSuccess";

interface IRTKQueryError {
  status: unknown;
  data: unknown;
}

// https://redux-toolkit.js.org/rtk-query/usage/error-handling
const isRTKQueryError = (error: unknown): error is IRTKQueryError =>
  error instanceof Object && "status" in error && "data" in error;

const transformSchemaFilters = (
  schemaFiltersType: DatabaseReplicationFormFields["schemaFiltersType"],
  schemaFiltersPatterns: DatabaseReplicationFormFields["schemaFiltersPatterns"],
) => ({
  "schema-filters-type": schemaFiltersType,
  "schema-filters-patterns": schemaFiltersPatterns,
});

export const DatabaseReplicationModal = ({
  opened,
  onClose,
  database,
}: Pick<ModalProps, "opened" | "onClose"> & {
  database: Database;
}) => {
  const [setupStep, setSetupStep] = useState<
    "form" | "setting-up" | "success" | "error"
  >("form");
  const [error, setError] = useState<string>();
  const handleError = (error: unknown) => {
    setSetupStep("error");
    if (isRTKQueryError(error) && typeof error.data === "string") {
      setError(error.data);
    }
  };
  const onModalClose = () => {
    setSetupStep("form");
    onClose();
  };

  const [createDatabaseReplication] = useCreateDatabaseReplicationMutation();
  const [previewDatabaseReplication] = usePreviewDatabaseReplicationMutation();
  const preview = useCallback(
    (
      {
        schemaFiltersType,
        schemaFiltersPatterns,
      }: DatabaseReplicationFormFields,
      handleResponse: (response: PreviewDatabaseReplicationResponse) => void,
    ) => {
      previewDatabaseReplication({
        databaseId: database.id,
        replicationSchemaFilters: transformSchemaFilters(
          schemaFiltersType,
          schemaFiltersPatterns,
        ),
      })
        .unwrap()
        .then(handleResponse)
        .catch(handleError);
    },
    [previewDatabaseReplication, database.id],
  );

  async function onSubmit({
    schemaFiltersType,
    schemaFiltersPatterns,
  }: DatabaseReplicationFormFields) {
    setSetupStep("setting-up");
    createDatabaseReplication({
      databaseId: database.id,
      replicationSchemaFilters: transformSchemaFilters(
        schemaFiltersType,
        schemaFiltersPatterns,
      ),
    })
      .unwrap()
      .then(() => setSetupStep("success"))
      .catch(handleError);
  }

  const isProgressStep = setupStep === "setting-up" || setupStep === "success";
  const isErrorStep = setupStep === "error";

  const canCloseModal = !isProgressStep && !isErrorStep;

  // The steps share one Modal so it doesn't remount when the step changes,
  // which means each step's layout, title and illustration are set on it here
  const stepModalProps = match(setupStep)
    .with("form", () => ({ title: t`Set up database replication` }))
    .with("setting-up", getDatabaseReplicationSettingUpModalProps)
    .with("success", getDatabaseReplicationSuccessModalProps)
    .with("error", () => ({ title: t`Couldn't replicate database` }))
    .exhaustive();

  return (
    <Modal
      opened={isProgressStep || opened}
      onClose={onModalClose}
      closeOnClickOutside={canCloseModal}
      closeOnEscape={canCloseModal}
      withCloseButton={canCloseModal}
      mah="80%"
      {...stepModalProps}
    >
      {setupStep === "form" ? (
        <DatabaseReplicationForm
          database={database}
          onSubmit={onSubmit}
          preview={preview}
          initialValues={{
            databaseId: database.id,
            schemaFiltersType: "all",
            schemaFiltersPatterns: "",
          }}
        />
      ) : setupStep === "setting-up" ? (
        <DatabaseReplicationSettingUp />
      ) : setupStep === "success" ? (
        <DatabaseReplicationSuccess onClose={onModalClose} />
      ) : setupStep === "error" ? (
        <DatabaseReplicationError error={error} onClose={onModalClose} />
      ) : undefined}
    </Modal>
  );
};
