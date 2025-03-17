import { useMemo } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DatabaseEditConnectionForm } from "metabase/admin/databases/components/DatabaseEditConnectionForm";
import { useGetDatabaseQuery, useUpdateDatabaseMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import title from "metabase/hoc/Title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";
import { Modal } from "metabase/ui";
import { useCreateMirrorDatabaseMutation } from "metabase-enterprise/api";
import type { DatabaseData } from "metabase-types/api";

import { paramIdToGetQuery } from "../utils";

import S from "./DestinationDatabaseConnectionModal.module.css";

export const DestinationDatabaseConnectionModalInner = ({
  params: { databaseId, destinationDatabaseId },
  route,
}: {
  params: { databaseId: string; destinationDatabaseId?: string };
  route: Route;
}) => {
  const dispatch = useDispatch();

  const primaryDbReq = useGetDatabaseQuery(paramIdToGetQuery(databaseId));
  const destinationDbReq = useGetDatabaseQuery(
    paramIdToGetQuery(destinationDatabaseId),
  );
  const [createMirrorDatabase] = useCreateMirrorDatabaseMutation();
  const [updateDatabase] = useUpdateDatabaseMutation();

  const isLoading = primaryDbReq.isLoading || destinationDbReq.isLoading;
  const error = primaryDbReq.error || destinationDbReq.error;
  const isNewDatabase = destinationDatabaseId === undefined;

  const destinationDatabase = useMemo(() => {
    return isNewDatabase
      ? { engine: primaryDbReq.currentData?.engine }
      : destinationDbReq.currentData;
  }, [isNewDatabase, primaryDbReq.currentData, destinationDbReq.currentData]);

  const addingNewDatabase = destinationDatabaseId === undefined;

  const handleCloseModal = () => {
    const id = primaryDbReq.currentData?.id;
    dispatch(
      id
        ? dispatch(push(Urls.viewDatabase(id)))
        : dispatch(push(Urls.viewDatabases())),
    );
  };

  const handleCreateMirrorDatabase = async (database: DatabaseData) => {
    return createMirrorDatabase({
      router_database_id: parseInt(databaseId, 10),
      mirrors: [database],
    }).unwrap();
  };

  const handleSaveDatabase = async (database: DatabaseData) => {
    if (database.id === undefined) {
      return handleCreateMirrorDatabase(database);
    } else {
      // TODO: it really doesn't like this type for two reasons
      // 1. the id key being ?ed
      // 2. a lot of fields are value | undefined in one type and value | null in the other
      // it appears the API endpoint doesn't like undefined when it expects null either
      // @ts-expect-error will fix
      return updateDatabase(database).unwrap();
    }
  };

  const handleOnSubmit = () => {
    handleCloseModal();
    dispatch(
      addUndo({ message: t`Destination database created successfully` }),
    );
  };

  return (
    <Modal
      title={
        addingNewDatabase
          ? t`Add destination database`
          : t`Edit destination database`
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
          database={destinationDatabase}
          isMirrorDatabase
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

export const DestinationDatabaseConnectionModal = title(
  ({ database }: { database: DatabaseData }) => database && database.name,
)(DestinationDatabaseConnectionModalInner);
