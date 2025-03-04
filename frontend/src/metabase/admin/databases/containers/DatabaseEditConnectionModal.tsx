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

export const DatabaseEditConnectionModalInner = ({
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
    if (addingNewDatabase) {
      reset();
      await initializeDatabase(undefined);
    }
  });

  const closeModal = () =>
    database?.id
      ? onChangeLocation(`/admin/databases/${database?.id}`)
      : onChangeLocation(`/admin/databases`);

  return (
    <Modal
      title={t`Edit connection details`}
      opened
      onClose={closeModal}
      padding="xl"
    >
      <DatabaseEditConnectionForm
        database={database}
        initializeError={initializeError}
        onChangeLocation={onChangeLocation}
        onSubmitted={closeModal}
        route={route}
      />
    </Modal>
  );
};

export const DatabaseEditConnectionModal = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(
    ({ database }: { database: DatabaseData }) => database && database.name,
  ),
)(DatabaseEditConnectionModalInner);
