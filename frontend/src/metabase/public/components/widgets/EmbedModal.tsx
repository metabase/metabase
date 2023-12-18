import { titleize } from "inflection";
import { useState } from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Icon } from "metabase/core/components/Icon";
import Modal from "metabase/components/Modal";
import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { Box, Center } from "metabase/ui";
import { EmbedTitleLabel } from "./EmbedModal.styled";

type EmbedModalStep = "application" | null;

const EmbedTitle = ({
  type,
  onClick = undefined,
}: {
  type: string;
  onClick?: () => void;
}) => (
  <a className="flex align-center" onClick={onClick}>
    <EmbedTitleLabel>{t`Sharing`}</EmbedTitleLabel>
    {type && <Icon name="chevronright" className="mx1 text-medium" />}
    {type}
  </a>
);

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
    embedType: EmbedModalStep;
    setEmbedType: (type: EmbedModalStep) => void;
  }) => JSX.Element;
} & WindowModalProps) => {
  const [embedType, setEmbedType] = useState<EmbedModalStep>(null);
  const applicationName = useSelector(getApplicationName);

  const onEmbedClose = () => {
    onClose();
    setEmbedType(null);
  };

  const isFullScreen = embedType === "application";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onEmbedClose}
      title={
        embedType ? (
          <Center>
            <EmbedTitle
              type={titleize(embedType)}
              onClick={() => setEmbedType(null)}
            />
          </Center>
        ) : (
          t`Embed ${applicationName}`
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
