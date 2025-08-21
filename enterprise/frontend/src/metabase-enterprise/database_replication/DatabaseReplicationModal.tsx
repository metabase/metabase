import { useCallback, useState } from "react";
import { t } from "ttag";

import { Modal, type ModalProps } from "metabase/ui";
import {
  type PreviewDatabaseReplicationResponse,
  useCreateDatabaseReplicationMutation,
  usePreviewDatabaseReplicationMutation,
} from "metabase-enterprise/api/database-replication";
import { DatabaseReplicationError } from "metabase-enterprise/database_replication/DatabaseReplicationError";
import { DatabaseReplicationSettingUp } from "metabase-enterprise/database_replication/DatabaseReplicationSettingUp";
import type { Database } from "metabase-types/api";

import {
  DatabaseReplicationForm,
  type DatabaseReplicationFormFields,
  handleFieldError as handleDWHReplicationFieldError,
} from "./DatabaseReplicationForm";
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

  const [createDatabaseReplication] = useCreateDatabaseReplicationMutation();
  const [previewDatabaseReplication] = usePreviewDatabaseReplicationMutation();
  const preview = useCallback(
    (
      { schemaFiltersType, schemaFiltersPatterns }: DatabaseReplicationFormFields,
      handleResponse: (response: PreviewDatabaseReplicationResponse) => void,
      handleError: (error: unknown) => void,
    ) => {
      previewDatabaseReplication({
        databaseId: database.id,
        replicationSchemaFilters: transformSchemaFilters(schemaFiltersType, schemaFiltersPatterns),
      })
        .unwrap()
        .then(handleResponse)
        .catch((error: unknown) => {
          isRTKQueryError(error) && handleDWHReplicationFieldError(error.data);
          handleError(error);
        });
    },
    [previewDatabaseReplication, database.id],
  );

  const onSubmit = useCallback(
    async ({ schemaFiltersType, schemaFiltersPatterns }: DatabaseReplicationFormFields) => {
      setSetupStep("setting-up");
      createDatabaseReplication({
        databaseId: database.id,
        replicationSchemaFilters: transformSchemaFilters(schemaFiltersType, schemaFiltersPatterns),
      })
        .unwrap()
        .then(() => setSetupStep("success"))
        .catch((error: unknown) => {
          setSetupStep("error");
          isRTKQueryError(error) &&
            typeof error.data === "string" &&
            setError(error.data);
        });
    },
    [createDatabaseReplication, database.id, setSetupStep],
  );

  const isProgressStep = setupStep === "setting-up" || setupStep === "success";
  const isErrorStep = setupStep === "error";

  const canCloseModal = !isProgressStep && !isErrorStep;

  return (
    <Modal
      opened={isProgressStep || opened}
      onClose={onClose}
      closeOnClickOutside={canCloseModal}
      closeOnEscape={canCloseModal}
      withCloseButton={canCloseModal}
      size={isErrorStep ? "40rem" : "30rem"}
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
        <DatabaseReplicationSuccess onClose={onClose} />
      ) : setupStep === "error" ? (
        <DatabaseReplicationError error={error} onClose={onClose} />
      ) : undefined}
    </Modal>
  );
};
