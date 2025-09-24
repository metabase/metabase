import { useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import Modal from "metabase/common/components/Modal";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import type { EmbedModalStep } from "metabase/public/lib/types";
import { getSetting } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Group, Icon, Stack, Text } from "metabase/ui";

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
    onClose();
    setEmbedType(null);
  };

  const modalTitle = useMemo(() => {
    if (isEmbeddingSetupStage) {
      return <EmbedModalTitle applicationName={applicationName} />;
    }
  }, [isEmbeddingSetupStage, applicationName]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onEmbedClose}
      title={modalTitle}
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

const EmbedModalTitle = ({ applicationName }: { applicationName: string }) => (
  <Stack gap="sm">
    <Text fw="bold" fz="h2">{t`Embed ${applicationName}`}</Text>

    <Link to="/admin/embedding/modular" className={CS.link}>
      <Group gap="xs">
        <Text c="brand">{t`Embedding settings`}</Text>
        <Icon c="brand" name="external" />
      </Group>
    </Link>
  </Stack>
);
