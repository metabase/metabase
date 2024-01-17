import { useState } from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import Modal from "metabase/components/Modal";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import type { EmbedType } from "metabase/public/lib/types";

import {
  EmbedModalHeader,
  EmbedModalHeaderBackIcon,
} from "./EmbedModal.styled";

interface EmbedModalProps {
  isOpen?: boolean;
  onClose: () => void;
  children: ({
    embedType,
    setEmbedType,
  }: {
    embedType: EmbedType;
    setEmbedType: (type: EmbedType) => void;
  }) => JSX.Element;
}

export const EmbedModal = ({ children, isOpen, onClose }: EmbedModalProps) => {
  const [embedType, setEmbedType] = useState<EmbedType>(null);
  const applicationName = useSelector(getApplicationName);

  const isEmbeddingStage = embedType === "application";

  const onEmbedClose = () => {
    MetabaseAnalytics.trackStructEvent("Sharing Modal", "Modal Closed");
    onClose();
    setEmbedType(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onEmbedClose}
      title={!isEmbeddingStage ? t`Embed ${applicationName}` : undefined}
      fit
      formModal={false}
    >
      {isEmbeddingStage && (
        <>
          <EmbedModalHeader onClose={onEmbedClose}>
            <EmbedModalHeaderBackIcon
              name="chevronleft"
              onClick={() => setEmbedType(null)}
            />
            {t`Static embedding`}
          </EmbedModalHeader>
        </>
      )}
      {children({ embedType, setEmbedType })}
    </Modal>
  );
};
