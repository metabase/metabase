import { t } from "ttag";

import { useNavigate, useParams } from "metabase/router";
import { Modal } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DestinationDatabasesList } from "../DestinationDatabasesList";

import S from "./DestinationDatabasesModal.module.css";

export const DestinationDatabasesModal = () => {
  const params = useParams<{ databaseId: string }>();
  const primaryDbId = parseInt(params.databaseId ?? "", 10);

  const navigate = useNavigate();
  const handleCloseModal = () => {
    navigate(Urls.viewDatabase(primaryDbId));
  };

  return (
    <Modal
      opened
      title={t`Destination databases`}
      onClose={handleCloseModal}
      padding="xxl"
      classNames={{
        content: S.modalRoot,
        header: S.modalHeader,
        body: S.modalBody,
      }}
    >
      <DestinationDatabasesList primaryDatabaseId={primaryDbId} />
    </Modal>
  );
};
