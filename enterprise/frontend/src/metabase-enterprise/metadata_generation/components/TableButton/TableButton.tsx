import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import type { MetadataGenerationTableButtonProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, Icon, Loader, Tooltip } from "metabase/ui";
import {
  type ConcreteTableId,
  type DatabaseId,
  type MetadataGenerationRunId,
  isConcreteTableId,
} from "metabase-types/api";

import { useDatabaseRun } from "../../hooks";
import { GenerateMetadataModal } from "../GenerateMetadataModal";

export function TableButton({ table }: MetadataGenerationTableButtonProps) {
  const isAdmin = useSelector(getUserIsAdmin);

  if (!isAdmin || !isConcreteTableId(table.id)) {
    return null;
  }

  return <TableButtonContent databaseId={table.db_id} tableId={table.id} />;
}

type TableButtonContentProps = {
  databaseId: DatabaseId;
  tableId: ConcreteTableId;
};

function TableButtonContent({ databaseId, tableId }: TableButtonContentProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const [startedRunId, setStartedRunId] =
    useState<MetadataGenerationRunId | null>(null);
  // A database has at most one active run, so the modal shows its progress
  // instead of a form that the server would reject.
  const { activeRun } = useDatabaseRun(databaseId);
  const modalRunId = startedRunId ?? activeRun?.id ?? null;
  const label =
    activeRun != null
      ? t`Generating field metadata…`
      : t`Generate field metadata`;

  const handleClose = () => {
    setStartedRunId(null);
    closeModal();
  };

  return (
    <>
      <Tooltip label={label}>
        <Button
          flex="0 1 auto"
          leftSection={
            activeRun != null ? <Loader size="xs" /> : <Icon name="sparkles" />
          }
          aria-label={label}
          onClick={openModal}
        />
      </Tooltip>
      <GenerateMetadataModal
        databaseId={databaseId}
        initialTableIds={[tableId]}
        isScopeFixed
        runId={modalRunId}
        opened={isModalOpen}
        onClose={handleClose}
        onRunStarted={setStartedRunId}
      />
    </>
  );
}
