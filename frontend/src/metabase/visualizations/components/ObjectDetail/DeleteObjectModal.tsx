import { FunctionComponent } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";

interface Props {
  onClose: () => void;
}

export const DeleteObjectModal: FunctionComponent<Props> = ({ onClose }) => (
  <ModalContent
    title={t`Are you sure you want to delete this row?`}
    footer={[
      <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
      <Button
        key="delete"
        danger
        onClick={onClose}
      >{t`Delete forever`}</Button>,
    ]}
    onClose={onClose}
  >
    {t`This will permanantly delete the row. There’s no undoing this, so please be sure.`}
  </ModalContent>
);
