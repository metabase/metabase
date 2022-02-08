import React from "react";
import { t } from "ttag";
import ActionModal from "../ActionModal";

export interface ListTimelineModalProps {
  onClose?: () => void;
}

const ListTimelineModal = ({
  onClose,
}: ListTimelineModalProps): JSX.Element => {
  return <ActionModal title={t`Events`} onClose={onClose} />;
};

export default ListTimelineModal;
