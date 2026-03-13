import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { ConvertToTransformModal } from "../../ConvertToTransformModal";

type ActionSectionProps = {
  card: Card;
};

export function ActionSection({ card }: ActionSectionProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  return (
    <>
      <Button
        variant="filled"
        leftSection={<Icon name="transform" />}
        onClick={openModal}
      >
        {t`Convert to a transform`}
      </Button>
      <ConvertToTransformModal
        card={card}
        opened={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
}
