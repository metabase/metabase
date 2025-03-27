import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Modal } from "metabase/ui";

import { DestinationDatabasesList } from "../DestinationDatabasesList";

import S from "./DestinationDatabasesModal.module.css";

export const DestinationDatabasesModal = ({
  params,
}: {
  params: { databaseId: string };
}) => {
  const primaryDbId = parseInt(params.databaseId, 10);

  const dispatch = useDispatch();
  const handleCloseModal = () => {
    dispatch(push(Urls.viewDatabase(primaryDbId)));
  };

  return (
    <Modal
      opened
      title={t`Destination databases`}
      onClose={handleCloseModal}
      padding="xl"
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
