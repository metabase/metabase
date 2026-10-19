import { t } from "ttag";

import { StaticEmbedSetupPane } from "metabase/embedding/components/EmbedModal/StaticEmbedSetupPane";
import type {
  EmbedResource,
  EmbedResourceParameter,
  GuestEmbedResourceType,
} from "metabase/embedding/types";
import { Group, Icon, Modal, UnstyledButton } from "metabase/ui";
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
    title={
      onBack ? (
        <Group component="span" gap="sm" wrap="nowrap">
          <UnstyledButton
            className={S.backButton}
            aria-label={t`Back`}
            onClick={onBack}
          >
            <Icon name="chevronleft" />
          </UnstyledButton>
          {t`Static embedding`}
        </Group>
      ) : (
        t`Static embedding`
      )
    }
    classNames={{ content: S.content, header: S.header, body: S.body }}
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
