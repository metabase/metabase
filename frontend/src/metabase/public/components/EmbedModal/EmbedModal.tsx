import { useState } from "react";
import { t } from "ttag";
import {
  EmbedModalHeaderBackIcon,
  EmbedTitleContainer,
} from "metabase/public/components/EmbedModal/EmbedModal.styled";
import { getSetting } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import Modal from "metabase/components/Modal";
import { Box, Divider, Text } from "metabase/ui";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import type { EmbedModalStep } from "./types";

type EmbedModalProps = {
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
};

const EmbedTitle = ({
  onClick,
  label,
}: {
  label: string;
  onClick?: () => void;
}) => {
  return (
    <EmbedTitleContainer onClick={onClick}>
      {onClick && (
        <EmbedModalHeaderBackIcon name="chevronleft" onClick={onClick} />
      )}
      <Text fz="xl" c="text.1">
        {label}
      </Text>
    </EmbedTitleContainer>
  );
};

export const EmbedModal = ({ children, isOpen, onClose }: EmbedModalProps) => {
  const shouldShowEmbedTerms = useSelector(state =>
    getSetting(state, "show-static-embed-terms"),
  );
  const [embedType, setEmbedType] = useState<EmbedModalStep>(null);
  const applicationName = useSelector(getApplicationName);

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
      fit
      formModal={false}
    >
      <Divider />
      <Box bg="bg.0" h="100%">
        {children({ embedType, goToNextStep, goBackToEmbedModal })}
      </Box>
    </Modal>
  );
};
