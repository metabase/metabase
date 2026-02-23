import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing";
import { Modal } from "metabase/ui";

import { DestinationDatabasesList } from "../DestinationDatabasesList";

import S from "./DestinationDatabasesModal.module.css";

export const DestinationDatabasesModal = ({
  params,
}: {
  params: { databaseId: string };
}) => {
  const { push } = useNavigation();
  const primaryDbId = parseInt(params.databaseId, 10);
  const handleCloseModal = () => {
    push(Urls.viewDatabase(primaryDbId));
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
