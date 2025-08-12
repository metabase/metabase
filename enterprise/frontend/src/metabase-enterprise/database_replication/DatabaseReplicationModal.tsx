import { useCallback, useState } from "react";
import { t } from "ttag";

import { Modal } from "metabase/ui";
import {
  type PreviewDatabaseReplicationResponse,
  useCreateDatabaseReplicationMutation,
  usePreviewDatabaseReplicationMutation,
} from "metabase-enterprise/api/database-replication";
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
  isOpen,
  onClose,
  database,
}: {
  isOpen: boolean;
  onClose: () => void;
  database: Database;
}) => {
  const [setupStep, setSetupStep] = useState<"form" | "setting-up" | "success">(
    "form",
  );
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
          setSetupStep("form");
          isRTKQueryError(error) && handleDWHReplicationFieldError(error.data);
        });
    },
    [createDatabaseReplication, database.id, setSetupStep],
  );

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="36rem"
      padding="2.5rem"
      py={
        setupStep === "setting-up" || setupStep === "success"
          ? undefined
          : "7rem"
      }
      title={
        setupStep === "setting-up" || setupStep === "success"
          ? undefined
          : t`Set up database replication`
      }
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
      ) : undefined}
    </Modal>
  );
};
