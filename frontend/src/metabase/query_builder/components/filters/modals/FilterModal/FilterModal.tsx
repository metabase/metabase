import React from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";

export interface FilterModalProps {
  onClose?: () => void;
}

const FilterModal = ({ onClose }: FilterModalProps): JSX.Element => {
  return (
    <ModalContent
      title={t`Filter`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button key="submit" primary onClick={onClose}>{t`Apply`}</Button>,
      ]}
      onClose={onClose}
    />
  );
};

export default FilterModal;
