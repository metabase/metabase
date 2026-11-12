import { t } from "ttag";

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
    title={t`Static embedding`}
    size="auto"
    classNames={{ content: S.content, header: S.header, body: S.body }}
    onBack={onBack}
    onClose={onClose}
  >
    <StaticEmbedSetupPane
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
    />
  </Modal>
);
