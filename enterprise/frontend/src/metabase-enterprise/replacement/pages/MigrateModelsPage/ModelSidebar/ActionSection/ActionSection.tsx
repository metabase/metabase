import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { ConvertToTransformModal } from "../../ConvertToTransformModal";

type ActionSectionProps = {
  result: SearchResult;
};

export function ActionSection({ result }: ActionSectionProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  return (
    <>
      <Button
        leftSection={<Icon name="transform" />}
        variant="filled"
        onClick={openModal}
      >
        {t`Convert to a transform`}
      </Button>
      <ConvertToTransformModal
        result={result}
        opened={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
}
