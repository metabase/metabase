import { push } from "react-router-redux";
import { t } from "ttag";

import { getEditingDatabase } from "metabase/admin/databases/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Modal } from "metabase/ui";
import Database from "metabase-lib/v1/metadata/Database";

import { RoutedDatabaesList } from "../RoutedDatabasesList";

import S from "./RoutedDatabasesModal.module.css";

export const RoutedDatabasesModal = () => {
  const dispatch = useDispatch();
  const primaryDb = useSelector(state => {
    const editingDb = getEditingDatabase(state);
    return editingDb ? new Database(editingDb) : undefined;
  });

  const handleCloseModal = () => {
    const dbPath = primaryDb?.id ? `/${primaryDb.id}` : "";
    dispatch(push(`/admin/databases${dbPath}`));
  };

  // TODO:
  if (!primaryDb) {
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
      <RoutedDatabaesList database={primaryDb} />
    </Modal>
  );
};
