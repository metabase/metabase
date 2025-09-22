import { useState } from "react";
import { t } from "ttag";

import Modal from "metabase/common/components/Modal";
import { useSelector } from "metabase/lib/redux";
import type { EmbedModalStep } from "metabase/public/lib/types";
import { getSetting } from "metabase/selectors/settings";

import { EmbedModalHeader } from "./EmbedModal.styled";

interface EmbedModalProps {
  isOpen?: boolean;
  onClose: () => void;
  children: ({
    embedType,
    goToNextStep,
    goBackToEmbedModal,
  }: {
    embedType: EmbedModalStep;
    goToNextStep: () => void;
    goBackToEmbedModal: () => void;
  }) => JSX.Element;
}

export const EmbedModal = ({ children, isOpen, onClose }: EmbedModalProps) => {
  const shouldShowEmbedTerms = useSelector((state) =>
    getSetting(state, "show-static-embed-terms"),
  );
  const [embedType, setEmbedType] = useState<EmbedModalStep>(null);

  const goToNextStep = () => {
    if (embedType === null && shouldShowEmbedTerms) {
      setEmbedType("legalese");
    } else {
      setEmbedType("application");
    }
  };

  const goBackToEmbedModal = () => {
    setEmbedType(null);
  };

  const onEmbedClose = () => {
    onClose();
    setEmbedType(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onEmbedClose}
      fit
      formModal={false}
      // needed to allow selecting with the mouse on the code samples
      enableMouseEvents
    >
      <EmbedModalHeader onClose={onEmbedClose} onBack={goBackToEmbedModal}>
        {t`Static embedding`}
      </EmbedModalHeader>

      {children({ embedType, goToNextStep, goBackToEmbedModal })}
    </Modal>
  );
};
