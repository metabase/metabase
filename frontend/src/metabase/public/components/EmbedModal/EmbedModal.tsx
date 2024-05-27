import { useState } from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { useSelector } from "metabase/lib/redux";
import type { EmbedModalStep } from "metabase/public/lib/types";
import { getSetting } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";

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
  const shouldShowEmbedTerms = useSelector(state =>
    getSetting(state, "show-static-embed-terms"),
  );
  const [embedType, setEmbedType] = useState<EmbedModalStep>(null);
  const applicationName = useSelector(getApplicationName);

  const isEmbeddingSetupStage = embedType === null;

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
    MetabaseAnalytics.trackStructEvent("Sharing Modal", "Modal Closed");
    onClose();
    setEmbedType(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onEmbedClose}
      title={isEmbeddingSetupStage ? t`Embed ${applicationName}` : undefined}
      fit
      formModal={false}
      // needed to allow selecting with the mouse on the code samples
      enableMouseEvents
    >
      {!isEmbeddingSetupStage && (
        <EmbedModalHeader onClose={onEmbedClose} onBack={goBackToEmbedModal}>
          {t`Static embedding`}
        </EmbedModalHeader>
      )}
      {children({ embedType, goToNextStep, goBackToEmbedModal })}
    </Modal>
  );
};
