import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { doesDatabaseSupportTransforms } from "metabase/transforms/utils";
import { Button, Icon, Tooltip } from "metabase/ui";
import type { Database, SearchResult } from "metabase-types/api";

import { ConvertToTransformModal } from "../../ConvertToTransformModal";

type ActionSectionProps = {
  result: SearchResult;
  database: Database | undefined;
};

export function ActionSection({ result, database }: ActionSectionProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  const supportsTransforms = doesDatabaseSupportTransforms(database);

  return (
    <>
      <Tooltip
        label={t`This database doesn't support transforms`}
        disabled={database == null || supportsTransforms}
      >
        <Button
          leftSection={<Icon name="transform" />}
          variant="filled"
          disabled={!supportsTransforms}
          onClick={openModal}
        >
          {t`Convert to a transform`}
        </Button>
      </Tooltip>
      <ConvertToTransformModal
        result={result}
        opened={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
}
