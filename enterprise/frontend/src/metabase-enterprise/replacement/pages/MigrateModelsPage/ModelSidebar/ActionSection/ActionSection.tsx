import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import { SourceReplacementButton } from "../../../../components/SourceReplacementButton";
import { ConvertToTransformModal } from "../../ConvertToTransformModal";

type ActionSectionProps = {
  cardId: CardId;
};

export function ActionSection({ cardId }: ActionSectionProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  return (
    <>
      <SourceReplacementButton>
        {({ tooltip, isDisabled }) => (
          <Tooltip label={tooltip} disabled={!tooltip}>
            <Button
              variant="filled"
              leftSection={<Icon name="transform" />}
              onClick={openModal}
              disabled={isDisabled}
            >
              {t`Convert to a transform`}
            </Button>
          </Tooltip>
        )}
      </SourceReplacementButton>
      <ConvertToTransformModal
        cardId={cardId}
        opened={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
}
