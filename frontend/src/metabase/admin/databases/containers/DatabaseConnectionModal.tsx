import type { LocationDescriptor } from "history";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import title from "metabase/hoc/Title";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { Modal } from "metabase/ui";
import type {
  DatabaseData,
  DatabaseEditErrorType,
  DatabaseId,
} from "metabase-types/api";

import { DatabaseEditConnectionForm } from "../components/DatabaseEditConnectionForm";

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
  const dispatch = useDispatch();

  const addingNewDatabase = params.databaseId === undefined;

  const databaseReq = useGetDatabaseQuery(
    addingNewDatabase ? skipToken : { id: parseInt(params.databaseId, 10) },
  );
  const database = databaseReq.currentData ?? {
    id: undefined,
    is_attached_dwh: false,
    router_user_attribute: undefined,
  };

  const handleCloseModal = () => {
    dispatch(
      database?.id
        ? push(`/admin/databases/${database.id}`)
        : push(`/admin/databases`),
    );
  };

  const handleOnSubmit = (savedDB: { id: DatabaseId }) => {
    if (addingNewDatabase) {
      dispatch(push(`/admin/databases/${savedDB.id}?created=true`));
    } else {
      handleCloseModal();
    }
  };

  return (
    <Modal
      title={addingNewDatabase ? t`Add a database` : t`Edit connection details`}
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
        config={{
          engine: {
            fieldState: database
              ? PLUGIN_DB_ROUTING.getPrimaryDBEngineFieldState(database)
              : "disabled",
          },
        }}
      />
    </Modal>
  );
};

export const DatabaseConnectionModal = title(
  ({ database }: { database: DatabaseData }) => database && database.name,
)(DatabaseConnectionModalInner);
