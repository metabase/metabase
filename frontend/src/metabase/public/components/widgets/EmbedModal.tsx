import { titleize } from "inflection";
import { useState } from "react";
import { t } from "ttag";
import { EmbedTitle } from "metabase/public/components/widgets/EmbedModalContent";
import Modal from "metabase/components/Modal";
import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { Box, Center } from "metabase/ui";

type EmbedModalStep = "application" | null;

export const EmbedModal = ({
  children,
  enabled,
  onClose,
  ...modalProps
}: {
  enabled?: boolean;
  onClose: () => void;
  children: ({
    embedType,
    setEmbedType,
  }: {
    embedType: EmbedModalStep;
    setEmbedType: (type: EmbedModalStep) => void;
  }) => JSX.Element;
} & WindowModalProps) => {
  const [embedType, setEmbedType] = useState<EmbedModalStep>(null);

  const onEmbedClose = () => {
    setEmbedType(null);
    onClose();
  };

  const isFullScreen = embedType === "application";

  return (
    <Modal
      isOpen={enabled}
      onClose={onEmbedClose}
      title={
        embedType ? (
          <Center>
            <EmbedTitle type={titleize(embedType)} />
          </Center>
        ) : (
          t`Embed Metabase`
        )
      }
      fit={!isFullScreen}
      full={isFullScreen}
      formModal={false}
      {...modalProps}
    >
      <Box bg="bg.0" h="100%">
        {children({ embedType, setEmbedType })}
      </Box>
    </Modal>
  );
};
