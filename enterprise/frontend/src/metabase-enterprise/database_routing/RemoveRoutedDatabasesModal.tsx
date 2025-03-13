import { push } from "react-router-redux";

import { DeleteDatabaseModal } from "metabase/admin/databases/components/DeleteDatabaseModel/DeleteDatabaseModal";
import { useDeleteDatabaseMutation, useGetDatabaseQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { Modal } from "metabase/ui";
import Database from "metabase-lib/v1/metadata/Database";

import { paramIdToGetQuery } from "./RoutedDatabaseConnectionModal/utils"; // TODO: move to a more common utils file

export const RemoveRoutedDatabaseModal = ({
  params: { databaseId, mirrorDatabaseId },
}: {
  params: { databaseId: string; mirrorDatabaseId: string };
}) => {
  const dispatch = useDispatch();

  const mirrorDbReq = useGetDatabaseQuery(paramIdToGetQuery(mirrorDatabaseId));
  const [deleteDatabase] = useDeleteDatabaseMutation();

  // TODO
  if (!mirrorDbReq.data) {
    return <div>TODO</div>;
  }

  // @ts-expect-error TODO fix
  const database = new Database(mirrorDbReq.data);

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
        database={database}
      />
    </Modal>
  );
};
