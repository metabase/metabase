import { useState } from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Icon } from "metabase/core/components/Icon";
import Modal from "metabase/components/Modal";
import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { Box, Text } from "metabase/ui";
import { EmbedTitleContainer } from "./EmbedModal.styled";

export type EmbedModalStep = "application" | "legalese" | null;

const EmbedTitle = ({
  onClick,
  label,
}: {
  label: string;
  onClick?: () => void;
}) => {
  return (
    <EmbedTitleContainer onClick={onClick}>
      {onClick && <Icon name="chevronleft" />}
      <Text fz="xl" c="text.1">
        {label}
      </Text>
    </EmbedTitleContainer>
  );
};

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
    goToNextStep,
    goBackToEmbedModal,
  }: {
    embedType: EmbedModalStep;
    goToNextStep: () => void;
    goBackToEmbedModal: () => void;
  }) => JSX.Element;
} & WindowModalProps) => {
  const [embedType, setEmbedType] = useState<EmbedModalStep>(null);
  const applicationName = useSelector(getApplicationName);

  const goToNextStep = () => {
    if (embedType === null) {
      setEmbedType("legalese");
    }

    if (embedType === "legalese") {
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

  const modalHeaderProps =
    embedType === null
      ? {
          label: t`Embed ${applicationName}`,
          onClick: undefined,
        }
      : {
          label: t`Static embedding`,
          onClick: goBackToEmbedModal,
        };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onEmbedClose}
      title={<EmbedTitle {...modalHeaderProps} />}
      fit={embedType !== "application"}
      wide={true}
      formModal={false}
      {...modalProps}
    >
      <Box bg="bg.0" h="100%">
        {children({ embedType, goToNextStep, goBackToEmbedModal })}
      </Box>
    </Modal>
  );
};
