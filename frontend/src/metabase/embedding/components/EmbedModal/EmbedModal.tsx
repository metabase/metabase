import { t } from "ttag";

import { StaticEmbedSetupPane } from "metabase/embedding/components/EmbedModal/StaticEmbedSetupPane";
import type {
  EmbedResource,
  EmbedResourceParameter,
  GuestEmbedResourceType,
} from "metabase/embedding/types";
import { Modal } from "metabase/ui";
import type { EmbeddingParameters } from "metabase-types/api";

import { EmbedModalHeader } from "./EmbedModal.styled";

interface EmbedModalProps {
  isOpen?: boolean;
  resource: EmbedResource;
  resourceType: GuestEmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  onUpdateEnableEmbedding: (enableEmbedding: boolean) => void;
  onUpdateEmbeddingParams: (embeddingParams: EmbeddingParameters) => void;
  onBack?: () => void;
  onClose: () => void;
}

export const EmbedModal = ({
  isOpen,
  resource,
  resourceType,
  resourceParameters,
  onUpdateEnableEmbedding,
  onUpdateEmbeddingParams,
  onBack,
  onClose,
}: EmbedModalProps) => (
  <Modal
    opened={isOpen ?? true}
    onClose={onClose}
    size="auto"
    padding={0}
    withCloseButton={false}
  >
    <EmbedModalHeader onClose={onClose} onBack={onBack}>
      {t`Static embedding`}
    </EmbedModalHeader>

    <StaticEmbedSetupPane
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
    />
  </Modal>
);
