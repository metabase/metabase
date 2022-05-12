import React from "react";
import { t } from "ttag";
import ModalContent from "metabase/components/ModalContent";

export interface FilterModalProps {
  onClose?: () => void;
}

const FilterModal = ({ onClose }: FilterModalProps): JSX.Element => {
  return <ModalContent title={t`Filter`} onClose={onClose} />;
};

export default FilterModal;
