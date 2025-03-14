import { push } from "react-router-redux";

import { DeleteDatabaseModal } from "metabase/admin/databases/components/DeleteDatabaseModel/DeleteDatabaseModal";
import { useDeleteDatabaseMutation, useGetDatabaseQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Modal } from "metabase/ui";

import { paramIdToGetQuery } from "./utils";

export const RemoveRoutedDatabaseModal = ({
  params: { databaseId, mirrorDatabaseId },
}: {
  params: { databaseId: string; mirrorDatabaseId: string };
}) => {
  const dispatch = useDispatch();

  const mirrorDbReq = useGetDatabaseQuery(paramIdToGetQuery(mirrorDatabaseId));
  const mirrorDb = mirrorDbReq.data;
  const [deleteDatabase] = useDeleteDatabaseMutation();

  // TODO: consolidate the handleCloseModal methods into a common util
  const handleCloseModal = () => {
    dispatch(push(`/admin/databases/${databaseId}`));
  };

  const handleDelete = async () => {
    await deleteDatabase(parseInt(mirrorDatabaseId, 10)).unwrap();
  };

  return (
    <Modal
      opened
      onClose={handleCloseModal}
      padding="0"
      withCloseButton={false}
    >
      <LoadingAndErrorWrapper
        loading={mirrorDbReq.isLoading}
        error={mirrorDbReq.error}
      >
        {mirrorDb && (
          <DeleteDatabaseModal
            onClose={handleCloseModal}
            onDelete={handleDelete}
            database={mirrorDb}
          />
        )}
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
