import { t } from "ttag";

import { ModalHeader } from "metabase/common/components/ModalContent";
import { StaticEmbedSetupPane } from "metabase/embedding/components/EmbedModal/StaticEmbedSetupPane";
import type {
  EmbedResource,
  EmbedResourceParameter,
  GuestEmbedResourceType,
} from "metabase/embedding/types";
import { Modal } from "metabase/ui";
import type { EmbeddingParameters } from "metabase-types/api";

import S from "./EmbedModal.module.css";

interface EmbedModalProps {
  opened: boolean;
  resource: EmbedResource;
  resourceType: GuestEmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  onUpdateEnableEmbedding: (enableEmbedding: boolean) => void;
  onUpdateEmbeddingParams: (embeddingParams: EmbeddingParameters) => void;
  onBack?: () => void;
  onClose: () => void;
}

export const EmbedModal = ({
  opened,
  resource,
  resourceType,
  resourceParameters,
  onUpdateEnableEmbedding,
  onUpdateEmbeddingParams,
  onBack,
  onClose,
}: EmbedModalProps) => (
  <Modal
    opened={opened}
    onClose={onClose}
    size="auto"
    withCloseButton={false}
    padding={0}
  >
    <ModalHeader
      py="lg"
      className={S.embedModalHeader}
      onClose={onClose}
      onBack={onBack}
    >
      {t`Static embedding`}
    </ModalHeader>

    <StaticEmbedSetupPane
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
    />
  </Modal>
);
