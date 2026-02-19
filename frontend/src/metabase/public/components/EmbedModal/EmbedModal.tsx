import { t } from "ttag";

import { Modal } from "metabase/common/components/Modal";
import { StaticEmbedSetupPane } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane";
import type {
  EmbedResource,
  EmbedResourceParameter,
  EmbeddingParameters,
  GuestEmbedResourceType,
} from "metabase/public/lib/types";

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
    isOpen={isOpen}
    onClose={onClose}
    fit
    formModal={false}
    // needed to allow selecting with the mouse on the code samples
    enableMouseEvents
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
