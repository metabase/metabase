import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";

import {
  AppIcon,
  ModalContentContainer,
  MessageContent,
  ModalMessage,
  ModalSubtitle,
  InsightIcon,
  IconContainer,
} from "./DataAppEducationModal.styled";

interface Props {
  onNextStep: () => void;
  onClose: () => void;
}

function DataAppEducationModal({ onNextStep, onClose }: Props) {
  return (
    <ModalContent
      formModal={false}
      footer={[
        <Button
          key="pick data"
          primary
          onClick={onNextStep}
        >{t`Pick data`}</Button>,
      ]}
      onClose={onClose}
    >
      <ModalContentContainer>
        <IconContainer>
          <InsightIcon name="insight" size={17} />
          <AppIcon name="app" size={30} />
        </IconContainer>
        <MessageContent>
          <ModalMessage>{t`Build tools to work with, create, and update data.`}</ModalMessage>
          <ModalSubtitle>{t`Metabase will help get you started with some basic pages you can customize.`}</ModalSubtitle>
        </MessageContent>
      </ModalContentContainer>
    </ModalContent>
  );
}

export default DataAppEducationModal;
