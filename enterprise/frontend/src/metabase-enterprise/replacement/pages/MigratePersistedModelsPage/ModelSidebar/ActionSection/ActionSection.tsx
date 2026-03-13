import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { SourceReplacementButton } from "../../../../components/SourceReplacementButton";
import { ConvertToTransformModal } from "../../ConvertToTransformModal";

type ActionSectionProps = {
  card: Card;
};

export function ActionSection({ card }: ActionSectionProps) {
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
        card={card}
        opened={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
}
