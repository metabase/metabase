import type { LocationDescriptor } from "history";
import type { Route } from "react-router";

import title from "metabase/hoc/Title";
import { Modal } from "metabase/ui";
import type { DatabaseData, DatabaseEditErrorType } from "metabase-types/api";

import { DatabaseEditConnectionForm } from "../components/DatabaseEditConnectionForm";
import { useDatabaseConnection } from "../hooks/use-database-connection";

import S from "./DatabaseConnectionModal.module.css";

export const DatabaseConnectionModalInner = ({
  route,
  params,
}: {
  initializeError?: DatabaseEditErrorType;
  route: Route;
  location: LocationDescriptor;
  params: { databaseId: string };
}) => {
  const {
    database,
    databaseReq,
    handleCancel: handleCloseModal,
    handleOnSubmit,
    title,
    config,
  } = useDatabaseConnection({ databaseId: params.databaseId });

  return (
    <Modal
      title={title}
      opened
      onClose={handleCloseModal}
      padding="xl"
      classNames={{
        content: S.modalRoot,
        header: S.modalHeader,
        body: S.modalBody,
      }}
    >
      <DatabaseEditConnectionForm
        database={database}
        isAttachedDWH={database?.is_attached_dwh ?? false}
        initializeError={databaseReq.error}
        onSubmitted={handleOnSubmit}
        onCancel={handleCloseModal}
        route={route}
        config={config}
        formLocation="admin"
      />
    </Modal>
  );
};

export const DatabaseConnectionModal = title(
  ({ database }: { database: DatabaseData }) => database && database.name,
)(DatabaseConnectionModalInner);
