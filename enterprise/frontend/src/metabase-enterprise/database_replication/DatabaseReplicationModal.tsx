import { useCallback, useState } from "react";
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
import { DatabaseReplicationSettingUp } from "./DatabaseReplicationSettingUp";
import { DatabaseReplicationSuccess } from "./DatabaseReplicationSuccess";

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

  return (
    <Modal
      opened={isProgressStep || opened}
      onClose={onModalClose}
      closeOnClickOutside={canCloseModal}
      closeOnEscape={canCloseModal}
      withCloseButton={canCloseModal}
      padding="2.5rem"
      title={
        isProgressStep
          ? undefined
          : isErrorStep
            ? t`Couldn't replicate database`
            : t`Set up database replication`
      }
      mah="80%"
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
