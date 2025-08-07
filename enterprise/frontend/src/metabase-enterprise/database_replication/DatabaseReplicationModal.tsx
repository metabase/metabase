import { useCallback, useState } from "react";
import { t } from "ttag";

import { Modal } from "metabase/ui";
import {
  type PreviewDatabaseReplicationResponse,
  useCreateDatabaseReplicationMutation,
  usePreviewDatabaseReplicationMutation,
} from "metabase-enterprise/api/database-replication";
import type { Database } from "metabase-types/api";

import {
  DatabaseReplicationForm,
  type DatabaseReplicationFormFields,
  handleFieldError as handleDWHReplicationFieldError,
} from "./DatabaseReplicationForm";
import { DatabaseReplicationSuccessModal } from "./DatabaseReplicationSuccessModal";

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
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createDatabaseReplication] = useCreateDatabaseReplicationMutation();
  const [previewDatabaseReplication] = usePreviewDatabaseReplicationMutation();
  const preview = useCallback(
    (
      { schemaSelect, schemaFilters }: DatabaseReplicationFormFields,
      handleResponse: (response: PreviewDatabaseReplicationResponse) => void,
    ) => {
      previewDatabaseReplication({
        databaseId: database.id,
        schemaFilters: transformSchemaFilters(schemaSelect, schemaFilters),
      })
        .unwrap()
        .then(handleResponse)
        .catch((error) => {
          isRTKQueryError(error) && handleDWHReplicationFieldError(error.data);
        });
    },
    [previewDatabaseReplication, database.id],
  );

  const onSubmit = useCallback(
    async ({ schemaSelect, schemaFilters }: DatabaseReplicationFormFields) =>
      createDatabaseReplication({
        databaseId: database.id,
        schemaFilters: transformSchemaFilters(schemaSelect, schemaFilters),
      })
        .unwrap()
        .then(() => setShowSuccessModal(true))
        .catch((error) => {
          isRTKQueryError(error) && handleDWHReplicationFieldError(error.data);
        }),
    [createDatabaseReplication, database.id],
  );

  const handleSuccessModalClose = useCallback(() => {
    setShowSuccessModal(false);
    onClose();
  }, [onClose]);

  if (showSuccessModal) {
    return (
      <DatabaseReplicationSuccessModal
        isOpen={showSuccessModal}
        onClose={handleSuccessModalClose}
        database={database}
      />
    );
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="36rem"
      padding="2.5rem"
      title={t`Set up database replication`}
    >
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
    </Modal>
  );
};
