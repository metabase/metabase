import { useMemo } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DatabaseEditConnectionForm } from "metabase/admin/databases/components/DatabaseEditConnectionForm";
import { useGetDatabaseQuery, useUpdateDatabaseMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import title from "metabase/hoc/Title";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Modal } from "metabase/ui";
import { useCreateMirrorDatabaseMutation } from "metabase-enterprise/api";
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

  const mirrorDatabase = useMemo(() => {
    return isNewDatabase
      ? { engine: primaryDbReq.currentData?.engine }
      : mirrorDbReq.currentData;
  }, [isNewDatabase, primaryDbReq.currentData, mirrorDbReq.currentData]);

  const addingNewDatabase = mirrorDatabaseId === undefined;

  const handleCloseModal = () => {
    const id = primaryDbReq.currentData?.id;
    const dbPath = id ? `/${id}` : "";
    dispatch(push(`/admin/databases${dbPath}`));
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
