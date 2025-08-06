import { t } from "ttag";

import { Modal } from "metabase/ui";
import { useCreateDatabaseReplicationMutation } from "metabase-enterprise/api/database-replication";
import type { Database } from "metabase-types/api";

import {
  type DWHReplicationFormFields,
  DatabaseReplicationForm,
  handleFieldError as handleDWHReplicationFieldError,
} from "./DatabaseReplicationForm";

interface IRTKQueryError {
  status: unknown;
  data: unknown;
}

// https://redux-toolkit.js.org/rtk-query/usage/error-handling
const isRTKQueryError = (error: unknown): error is IRTKQueryError =>
  error instanceof Object && "status" in error && "data" in error;

export const DatabaseReplicationModal = ({
  isOpen,
  onClose,
  database,
}: {
  isOpen: boolean;
  onClose: () => void;
  database: Database;
}) => {
  const [createDatabaseReplication] = useCreateDatabaseReplicationMutation();

  const onSubmit = async ({
    schemaSelect,
    schemaFilters,
  }: DWHReplicationFormFields) =>
    createDatabaseReplication({
      databaseId: database.id,
      schemaFilters:
        schemaSelect === "all"
          ? undefined
          : schemaFilters
              .split(",")
              .map((pattern) => pattern.trim())
              .map((pattern) => ({ type: schemaSelect, pattern })),
    })
      .unwrap()
      .then(onClose)
      .catch((error) => {
        isRTKQueryError(error) && handleDWHReplicationFieldError(error.data);
      });

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
        initialValues={{
          databaseId: database.id,
          schemaSelect: "all",
          schemaFilters: "",
        }}
      />
    </Modal>
  );
};
