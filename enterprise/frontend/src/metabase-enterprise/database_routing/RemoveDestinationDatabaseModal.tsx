import { push } from "react-router-redux";
import { t } from "ttag";

import { DeleteDatabaseModal } from "metabase/admin/databases/components/DeleteDatabaseModel/DeleteDatabaseModal";
import { useDeleteDatabaseMutation, useGetDatabaseQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Modal } from "metabase/ui";

export const RemoveDestinationDatabaseModal = ({
  params,
}: {
  params: { databaseId: string; destinationDatabaseId: string };
}) => {
  const dispatch = useDispatch();

  const dbId = parseInt(params.databaseId, 10);
  const destDbId = parseInt(params.destinationDatabaseId, 10);

  const { data: db, isLoading, error } = useGetDatabaseQuery({ id: destDbId });
  const [deleteDatabase] = useDeleteDatabaseMutation();

  const handleCloseModal = () => {
    dispatch(push(Urls.viewDatabase(dbId)));
  };

  const handleDelete = async () => {
    await deleteDatabase(destDbId).unwrap();
  };

  if (isLoading || error || !db) {
    return (
      <Modal opened onClose={handleCloseModal} padding="xl">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Modal>
    );
  }

  return (
    <DeleteDatabaseModal
      opened
      title={t`Delete the ${db.name} destination database?`}
      defaultDatabaseRemovalMessage={t`Users routed to this database will lose access to every question, model, metric, and segment if you continue.`}
      onClose={handleCloseModal}
      onDelete={handleDelete}
      database={db}
    />
  );
};
