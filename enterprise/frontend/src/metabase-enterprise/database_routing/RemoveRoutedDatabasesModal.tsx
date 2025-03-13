import { push } from "react-router-redux";

import { DeleteDatabaseModal } from "metabase/admin/databases/components/DeleteDatabaseModel/DeleteDatabaseModal";
import { useDeleteDatabaseMutation, useGetDatabaseQuery } from "metabase/api";
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

  // TODO
  if (!mirrorDb) {
    return <div>TODO</div>;
  }

  const handleCloseModal = () => {
    dispatch(push(`/admin/databases/${databaseId}`));
  };

  const handleDelete = async () => {
    // TODO: clean up
    if (mirrorDatabaseId) {
      await deleteDatabase(parseInt(mirrorDatabaseId, 10));
    }
  };

  return (
    <Modal
      opened
      onClose={handleCloseModal}
      padding="0"
      withCloseButton={false}
    >
      <DeleteDatabaseModal
        onClose={handleCloseModal}
        onDelete={handleDelete}
        database={mirrorDb}
      />
    </Modal>
  );
};
