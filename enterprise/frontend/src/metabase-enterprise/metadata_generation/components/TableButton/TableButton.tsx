import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import type { MetadataGenerationTableButtonProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, Icon, Tooltip } from "metabase/ui";
import { isConcreteTableId } from "metabase-types/api";

import { GenerateMetadataModal } from "../GenerateMetadataModal";

export function TableButton({ table }: MetadataGenerationTableButtonProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();

  if (!isAdmin || !isConcreteTableId(table.id)) {
    return null;
  }

  return (
    <>
      <Tooltip label={t`Generate metadata`}>
        <Button
          flex="0 1 auto"
          leftSection={<Icon name="sparkles" />}
          aria-label={t`Generate metadata`}
          onClick={openModal}
        />
      </Tooltip>
      <GenerateMetadataModal
        databaseId={table.db_id}
        initialTableIds={[table.id]}
        opened={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
}
