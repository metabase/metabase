import { Modal } from "metabase/ui";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";

import S from "./RoutedDatabasesModal.module.css";
import { getEditingDatabase } from "metabase/admin/databases/selectors";
import Database from "metabase-lib/v1/metadata/Database";
import { RoutedDatabaesList } from "../RoutedDatabasesList";

export const RoutedDatabasesModal = () => {
  const database = useSelector(state => {
    const editingDb = getEditingDatabase(state);
    return editingDb ? new Database(editingDb) : undefined;
  });

  const handleCloseModal = () => {
    // TODO
  };

  if (!database) {
    return (
      <Modal opened onClose={handleCloseModal} title={t`Mirror databases`}>
        Loading
      </Modal>
    );
  }

  return (
    <Modal
      title={t`Mirror databases`}
      opened
      onClose={handleCloseModal}
      padding="xl"
      classNames={{
        content: S.modalRoot,
        header: S.modalHeader,
        body: S.modalBody,
      }}
    >
      <RoutedDatabaesList database={database} />
    </Modal>
  );
};
