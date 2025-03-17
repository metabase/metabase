import { push } from "react-router-redux";

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
  const destDbId = parseInt(params.databaseId, 10);

  const destinationDbReq = useGetDatabaseQuery({ id: destDbId });
  const [deleteDatabase] = useDeleteDatabaseMutation();

  const destinationDb = destinationDbReq.data;

  const handleCloseModal = () => {
    dispatch(push(Urls.viewDatabase(dbId)));
  };

  const handleDelete = async () => {
    await deleteDatabase(destDbId).unwrap();
  };

  return (
    <Modal
      opened
      onClose={handleCloseModal}
      padding="0"
      withCloseButton={false}
    >
      <LoadingAndErrorWrapper
        loading={destinationDbReq.isLoading}
        error={destinationDbReq.error}
      >
        {destinationDb && (
          <DeleteDatabaseModal
            onClose={handleCloseModal}
            onDelete={handleDelete}
            database={destinationDb}
          />
        )}
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
