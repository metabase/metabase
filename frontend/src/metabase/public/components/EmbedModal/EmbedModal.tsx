import { useState } from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import Modal from "metabase/components/Modal";
import { Divider } from "metabase/ui";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import { EmbedModalHeaderBackIcon } from "./EmbedModal.styled";
import type { EmbedType } from "./types";

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
      title={
        isEmbeddingStage ? (
          <>
            <EmbedModalHeaderBackIcon
              name="chevronleft"
              onClick={() => setEmbedType(null)}
            />
            {t`Static embedding`}
          </>
        ) : (
          t`Embed ${applicationName}`
        )
      }
      fit
      formModal={false}
    >
      <Divider />
      {children({ embedType, setEmbedType })}
    </Modal>
  );
};
