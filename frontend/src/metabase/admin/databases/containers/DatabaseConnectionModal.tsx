import type { LocationDescriptor } from "history";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import title from "metabase/hoc/Title";
import { connect } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Modal } from "metabase/ui";
import Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseData, DatabaseId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  DatabaseEditConnectionForm,
  type DatabaseEditErrorType,
} from "../components/DatabaseEditConnectionForm";
import { initializeDatabase, reset } from "../database";
import { getEditingDatabase, getInitializeError } from "../selectors";

import S from "./DatabaseConnectionModal.module.css";

const mapStateToProps = (state: State) => {
  const database = getEditingDatabase(state);

  return {
    database: database ? new Database(database) : undefined,
    initializeError: getInitializeError(state),
    isAdmin: getUserIsAdmin(state),
  };
};

const mapDispatchToProps = {
  reset,
  initializeDatabase,
  onChangeLocation: push,
};

export const DatabaseConnectionModalInner = ({
  database,
  initializeError,
  onChangeLocation,
  route,
  params,
  reset,
  initializeDatabase,
}: {
  database?: Database;
  initializeError?: DatabaseEditErrorType;
  onChangeLocation: (location: LocationDescriptor) => void;
  route: Route;
  params: { databaseId?: DatabaseId };
  reset: () => void;
  initializeDatabase: (databaseId: DatabaseId | undefined) => Promise<void>;
}) => {
  const addingNewDatabase = params.databaseId === undefined;
  useMount(async () => {
    if (!database || database.id !== params.databaseId) {
      reset();
      await initializeDatabase(params.databaseId);
    }
  });

  const handleCloseModal = () => {
    return database?.id
      ? onChangeLocation(`/admin/databases/${database?.id}`)
      : onChangeLocation(`/admin/databases`);
  };

  const handleOnSubmit = (savedDB: { id: DatabaseId }) => {
    if (addingNewDatabase) {
      onChangeLocation(`/admin/databases/${savedDB?.id}?created=true`);
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
        initializeError={initializeError}
        onSubmitted={handleOnSubmit}
        onCancel={handleCloseModal}
        route={route}
      />
    </Modal>
  );
};

export const DatabaseConnectionModal = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(
    ({ database }: { database: DatabaseData }) => database && database.name,
  ),
)(DatabaseConnectionModalInner);
