import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Modal } from "metabase/ui";

import { RoutedDatabaesList } from "../RoutedDatabasesList";

import S from "./RoutedDatabasesModal.module.css";

export const RoutedDatabasesModal = ({
  params,
}: {
  params: { databaseId: string };
}) => {
  const dispatch = useDispatch();

  const primaryDbId = parseInt(params.databaseId, 10);

  const handleCloseModal = () => {
    dispatch(push(`/admin/databases/${primaryDbId}`));
  };

  return (
    <Modal
      opened
      title={t`Mirror databases`}
      onClose={handleCloseModal}
      padding="xl"
      classNames={{
        content: S.modalRoot,
        header: S.modalHeader,
        body: S.modalBody,
      }}
    >
      <RoutedDatabaesList primaryDatabaseId={primaryDbId} />
    </Modal>
  );
};
