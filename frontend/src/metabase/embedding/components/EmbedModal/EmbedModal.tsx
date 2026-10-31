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
  <Modal.Root
    opened={opened}
    onClose={onClose}
    size="auto"
    classNames={{ content: S.content, header: S.header, body: S.body }}
  >
    <Modal.Overlay />
    <Modal.Content>
      <Modal.Header>
        <Group gap="sm" wrap="nowrap" flex="1 1 auto" miw={0}>
          {onBack && (
            <UnstyledButton
              className={S.backButton}
              aria-label={t`Back`}
              onClick={onBack}
            >
              <Icon name="chevronleft" />
            </UnstyledButton>
          )}
          <Modal.Title
            className={onBack ? S.clickableTitle : undefined}
            onClick={onBack}
          >
            {t`Static embedding`}
          </Modal.Title>
        </Group>
        <Modal.CloseButton />
      </Modal.Header>
      <Modal.Body>
        <StaticEmbedSetupPane
          resource={resource}
          resourceType={resourceType}
          resourceParameters={resourceParameters}
          onUpdateEnableEmbedding={onUpdateEnableEmbedding}
          onUpdateEmbeddingParams={onUpdateEmbeddingParams}
        />
      </Modal.Body>
    </Modal.Content>
  </Modal.Root>
);
