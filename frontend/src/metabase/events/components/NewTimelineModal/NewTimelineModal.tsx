import React from "react";
import { t } from "ttag";
import MenuModal from "../MenuModal";

export interface NewTimelineModalProps {
  onClose?: () => void;
}

const NewTimelineModal = ({ onClose }: NewTimelineModalProps): JSX.Element => {
  return <MenuModal title={t`New event timeline`} onClose={onClose} />;
};

export default NewTimelineModal;
