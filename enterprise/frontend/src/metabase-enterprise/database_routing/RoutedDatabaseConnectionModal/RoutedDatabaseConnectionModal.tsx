import { useMemo } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DatabaseEditConnectionForm } from "metabase/admin/databases/components/DatabaseEditConnectionForm";
import { useGetDatabaseQuery, useUpdateDatabaseMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import Databases from "metabase/entities/databases";
import title from "metabase/hoc/Title";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Modal } from "metabase/ui";
import { useCreateMirrorDatabaseMutation } from "metabase-enterprise/api";
import Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseData } from "metabase-types/api";

import { paramIdToGetQuery } from "../utils";

import S from "./RoutedDatabaseConnectionModal.module.css";

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
  const [updateDatabase] = useUpdateDatabaseMutation();

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

  const handleCreateMirrorDatabase = async (database: DatabaseData) => {
    // TODO: handle error case
    const result = await createMirrorDatabase({
      router_database_id: parseInt(databaseId, 10),
      mirrors: [database],
    });
    const db = result.data?.[0];
    if (!db) {
      throw new Error("expected a db to have been created");
    }
    return db;
  };

  const handleSaveDatabase = async (database: DatabaseData) => {
    if (isNewDatabase) {
      // TODO: handle errors
      const result = await handleCreateMirrorDatabase(database);
      return result;
    } else {
      // TODO: handle errors
      // @ts-expect-error doesn't like the type for some reason..
      const result = await updateDatabase(database);
      if (result.error || !result.data) {
        throw result.error;
      }
      return result.data;
    }
  };

  const handleOnSubmit = () => {
    handleCloseModal();
    dispatch(
      addUndo({ message: t`Destination database created successfully` }),
    );
  };

  // TODO: when coming from the "Add" button, intial focus somehow ends up on the body
  // this isn't the case if you refresh the page (initial page load correctly places it on the name input)
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
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <DatabaseEditConnectionForm
          database={mirrorDatabase}
          isMirrorDatabase
          initializeError={undefined /* TODO */}
          handleSaveDb={handleSaveDatabase}
          onSubmitted={handleOnSubmit}
          onCancel={handleCloseModal}
          route={route}
          autofocusFieldName="name"
        />
      </LoadingAndErrorWrapper>
    </Modal>
  );
};

export const RoutedDatabaseConnectionModal = title(
  ({ database }: { database: DatabaseData }) => database && database.name,
)(RoutedDatabaseConnectionModalInner);
