import { push } from "react-router-redux";
import { t } from "ttag";

import { getEditingDatabase } from "metabase/admin/databases/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Modal } from "metabase/ui";

import { RoutedDatabaesList } from "../RoutedDatabasesList";

import S from "./RoutedDatabasesModal.module.css";

export const RoutedDatabasesModal = () => {
  const dispatch = useDispatch();
  const primaryDbId = useSelector(state => {
    const editingDb = getEditingDatabase(state);
    return editingDb?.id;
  });

  const handleCloseModal = () => {
    const dbPath = primaryDbId ? `/${primaryDbId}` : "";
    dispatch(push(`/admin/databases${dbPath}`));
  };

  // TODO:
  if (!primaryDbId) {
    return (
      <Modal opened onClose={handleCloseModal} title={t`Mirror databases`}>
        Loading
      </Modal>
    );
  }

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
