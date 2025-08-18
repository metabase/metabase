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
  schemaSelect: DatabaseReplicationFormFields["schemaSelect"],
  schemaFilters: DatabaseReplicationFormFields["schemaFilters"],
) =>
  schemaSelect === "all"
    ? undefined
    : schemaFilters
        .split(",")
        .map((pattern) => pattern.trim())
        .map((pattern) => ({ type: schemaSelect, pattern }));

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
      { schemaSelect, schemaFilters }: DatabaseReplicationFormFields,
      handleResponse: (response: PreviewDatabaseReplicationResponse) => void,
      handleError: (error: unknown) => void,
    ) => {
      previewDatabaseReplication({
        databaseId: database.id,
        schemaFilters: transformSchemaFilters(schemaSelect, schemaFilters),
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
    async ({ schemaSelect, schemaFilters }: DatabaseReplicationFormFields) => {
      setSetupStep("setting-up");
      createDatabaseReplication({
        databaseId: database.id,
        schemaFilters: transformSchemaFilters(schemaSelect, schemaFilters),
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
      closeOnClickOutside={!canCloseModal}
      closeOnEscape={!canCloseModal}
      withCloseButton={!canCloseModal}
      size={isErrorStep ? "80%" : "30rem"}
      padding="2.5rem"
      title={
        isProgressStep
          ? undefined
          : isErrorStep
            ? t`Couldn't replicate database`
            : t`Set up database replication`
      }
      mah="80%"
      maw={isErrorStep ? 640 : undefined}
    >
      {setupStep === "form" ? (
        <DatabaseReplicationForm
          database={database}
          onSubmit={onSubmit}
          preview={preview}
          initialValues={{
            databaseId: database.id,
            schemaSelect: "all",
            schemaFilters: "",
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
