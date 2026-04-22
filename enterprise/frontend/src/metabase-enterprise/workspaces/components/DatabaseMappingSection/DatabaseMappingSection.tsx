import { useState } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { Box, Button, Icon } from "metabase/ui";
import type { WorkspaceDatabaseDraft } from "metabase-types/api";

import { TitleSection } from "../TitleSection";

import { DatabaseMappingList } from "./DatabaseMappingList";
import { DatabaseMappingModal } from "./DatabaseMappingModal";

type DatabaseMappingSectionProps = {
  mappings: WorkspaceDatabaseDraft[];
  onChange: (mappings: WorkspaceDatabaseDraft[]) => void;
};

export function DatabaseMappingSection({
  mappings,
  onChange,
}: DatabaseMappingSectionProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<WorkspaceDatabaseDraft>();

  const handleAdd = (mapping: WorkspaceDatabaseDraft) => {
    onChange([...mappings, mapping]);
  };

  const handleUpdate = (mapping: WorkspaceDatabaseDraft) => {
    if (editing == null) {
      return;
    }
    onChange(
      mappings.map((current) =>
        current.database_id === editing.database_id ? mapping : current,
      ),
    );
  };

  const handleDelete = (mapping: WorkspaceDatabaseDraft) => {
    onChange(
      mappings.filter((current) => current.database_id !== mapping.database_id),
    );
  };

  return (
    <>
      <TitleSection
        label={t`Database isolation`}
        description={t`Configure how databases are isolated for this workspace.`}
        rightSection={
          <Button
            leftSection={<Icon name="add" />}
            onClick={() => setIsCreating(true)}
          >
            {t`Add database`}
          </Button>
        }
      >
        {mappings.length === 0 ? (
          <Box p="xl">
            <ListEmptyState label={t`No databases yet`} />
          </Box>
        ) : (
          <DatabaseMappingList mappings={mappings} onRowClick={setEditing} />
        )}
      </TitleSection>
      {isCreating && (
        <DatabaseMappingModal
          onSubmit={handleAdd}
          onClose={() => setIsCreating(false)}
        />
      )}
      {editing != null && (
        <DatabaseMappingModal
          mapping={editing}
          onSubmit={handleUpdate}
          onDelete={handleDelete}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
