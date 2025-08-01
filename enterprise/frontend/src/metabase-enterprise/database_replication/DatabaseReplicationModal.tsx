import { t } from "ttag";

import { Modal, Progress, Text } from "metabase/ui";
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
    schemas,
  }: DWHReplicationFormFields) =>
    createDatabaseReplication({
      databaseId: database.id,
      schemas:
        schemaSelect === "all"
          ? undefined
          : schemas
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
      <>
        {/* FIXME: Get values from Store API and fix the layout to look like the UI design. */}
        <Text c="text-light">{database.name}</Text>
        <Text style={{ "font-weight": "bold" }}>{t`12,345,678 rows`}</Text>
        <Text c="text-light">{t`Available Cloud Storage`}</Text>
        <Text style={{ "font-weight": "bold" }}>{t`20M rows`}</Text>
        <Progress value={(12_345_678 / 20_000_000) * 100} />
      </>
      <DatabaseReplicationForm
        onSubmit={onSubmit}
        onCancel={onClose}
        initialValues={{
          databaseId: database.id,
          schemaSelect: "all",
          schemas: "",
        }}
      />
    </Modal>
  );
};
