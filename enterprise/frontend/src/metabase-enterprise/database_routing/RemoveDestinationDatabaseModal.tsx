import { push } from "react-router-redux";

import { DeleteDatabaseModal } from "metabase/admin/databases/components/DeleteDatabaseModel/DeleteDatabaseModal";
import { useDeleteDatabaseMutation, useGetDatabaseQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Modal } from "metabase/ui";

import { paramIdToGetQuery } from "./utils";

export const RemoveDestinationDatabaseModal = ({
  params: { databaseId, destinationDatabaseId },
}: {
  params: { databaseId: string; destinationDatabaseId: string };
}) => {
  const dispatch = useDispatch();

  const destinationDbReq = useGetDatabaseQuery(
    paramIdToGetQuery(destinationDatabaseId),
  );
  const destinationDb = destinationDbReq.data;
  const [deleteDatabase] = useDeleteDatabaseMutation();

  // TODO: consolidate the handleCloseModal methods into a common util
  const handleCloseModal = () => {
    dispatch(push(`/admin/databases/${databaseId}`));
  };

  const handleDelete = async () => {
    await deleteDatabase(parseInt(destinationDatabaseId, 10)).unwrap();
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
