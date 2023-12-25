import { useState } from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import Modal from "metabase/components/Modal";
import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { Box } from "metabase/ui";

import type { EmbedType } from "metabase/public/components/widgets/EmbeddingModal/EmbeddingModalContent.types";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { ModalContentActionIcon } from "metabase/components/ModalContent";
import { EmbedModalHeader } from "./EmbedModal.styled";

export const EmbedModal = ({
  children,
  isOpen,
  onClose,
  ...modalProps
}: {
  isOpen?: boolean;
  onClose: () => void;
  children: ({
    embedType,
    setEmbedType,
  }: {
    embedType: EmbedType;
    setEmbedType: (type: EmbedType) => void;
  }) => JSX.Element;
} & WindowModalProps) => {
  const [embedType, setEmbedType] = useState<EmbedType>(null);
  const applicationName = useSelector(getApplicationName);

  const onEmbedClose = () => {
    MetabaseAnalytics.trackStructEvent("Sharing Modal", "Modal Closed");
    onClose();
    setEmbedType(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onEmbedClose}
      title={!embedType ? t`Embed ${applicationName}` : undefined}
      fit
      formModal={false}
      {...modalProps}
    >
      <Box bg="bg.0" h="100%">
        {embedType && (
          <EmbedModalHeader onClose={onEmbedClose}>
            <ModalContentActionIcon
              name="chevronleft"
              onClick={() => setEmbedType(null)}
            />

            {t`Static embedding`}
          </EmbedModalHeader>
        )}
        {children({ embedType, setEmbedType })}
      </Box>
    </Modal>
  );
};
