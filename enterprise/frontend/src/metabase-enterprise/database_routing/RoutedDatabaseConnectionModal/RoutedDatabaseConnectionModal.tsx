import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import title from "metabase/hoc/Title";
import { Modal } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";
import type { Route } from "react-router";

import { DatabaseEditConnectionForm } from "metabase/admin/databases/components/DatabaseEditConnectionForm";

import S from "./RoutedDatabaseConnectionModal.module.css";
import { useGetDatabaseQuery } from "metabase/api";
import { useMemo } from "react";
import Database from "metabase-lib/v1/metadata/Database";
import Databases from "metabase/entities/databases";
import { push } from "react-router-redux";
import { paramIdToGetQuery } from "./utils";
import { useCreateMirrorDatabaseMutation } from "metabase-enterprise/api";
import { addUndo } from "metabase/redux/undo";

export const RoutedDatabaseConnectionModalInner = ({
  params: { databaseId, mirrorDatabaseId },
  route,
}: {
  params: { databaseId: string; mirrorDatabaseId?: string };
  route: Route;
}) => {
  const dispatch = useDispatch();

  const primaryDbReq = useGetDatabaseQuery(paramIdToGetQuery(databaseId));
  const mirrorDbReq = useGetDatabaseQuery(paramIdToGetQuery(mirrorDatabaseId));
  const [createMirrorDatabase] = useCreateMirrorDatabaseMutation();

  const isLoading = primaryDbReq.isLoading || mirrorDbReq.isLoading;
  const error = primaryDbReq.error || mirrorDbReq.error;
  const isNewDatabase = mirrorDatabaseId === undefined;

  const primaryDbData = primaryDbReq.currentData;
  const mirrorDatabase = useMemo(() => {
    if (isNewDatabase) {
      return primaryDbReq.currentData
        ? // HACK: need the form to start with an initial engine value that matches the parent
          // `Database`'s types don't offically support a partial value but this appears to work
          // @ts-expect-error will remove
          new Database({ engine: primaryDbReq.currentData.engine })
        : undefined;
    }

    // HACK: temp work around
    const fakeAction = { payload: mirrorDbReq.currentData };
    const normalizedDbData = Databases.HACK_getObjectFromAction(fakeAction);
    return new Database(normalizedDbData);
  }, [isNewDatabase, primaryDbReq.currentData, mirrorDbReq.currentData]);

  const addingNewDatabase = mirrorDatabaseId === undefined;

  const handleCloseModal = () => {
    const dbPath = primaryDbData?.id ? `/${primaryDbData.id}` : "";
    dispatch(push(`/admin/databases${dbPath}`));
  };

  const handleSaveDatabase = async (database: DatabaseData) => {
    // TODO: handle error case
    const result = await createMirrorDatabase({
      router_database_id: parseInt(databaseId, 10),
      mirrors: [database],
    });
    const db = result.data?.[0];
    if (!db) throw new Error("expected a db to have been created");
    return db;
  };
  const handleOnSubmit = () => {
    handleCloseModal();
    dispatch(
      addUndo({ message: t`Destination database created successfully` }),
    );
  };

  // TODO;
  if (error) {
    return (
      <Modal title="Error" opened onClose={handleCloseModal}>
        <div>{JSON.stringify(error)}</div>;
      </Modal>
    );
  }

  // TODO:
  if (!mirrorDatabase || isLoading) {
    return (
      <Modal title="Loading" opened onClose={handleCloseModal}>
        <div>Loading</div>;
      </Modal>
    );
  }

  // TODO: make name the initial input focused on open
  return (
    <Modal
      title={
        addingNewDatabase ? t`Add mirror database` : t`Edit mirror database`
      }
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
        database={mirrorDatabase}
        isMirrorDatabase
        initializeError={undefined /* TODO */}
        handleSaveDb={handleSaveDatabase}
        onSubmitted={handleOnSubmit}
        onCancel={handleCloseModal}
        route={route}
      />
    </Modal>
  );
};

export const RoutedDatabaseConnectionModal = title(
  ({ database }: { database: DatabaseData }) => database && database.name,
)(RoutedDatabaseConnectionModalInner);
