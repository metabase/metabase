import { t } from "ttag";

import { Button, Flex, Icon, Stack, Text } from "metabase/ui";
import type { GroupMappings } from "metabase-types/api";

import { GroupMappingList } from "./GroupMappingList";
import type { SaveMappings } from "./use-group-mappings";
import { useMappingDeletion } from "./use-mapping-deletion";
import { useMappingEditor } from "./use-mapping-editor";
import type { GroupLookup } from "./utils";

type GroupMappingsPanelProps = {
  mappings: GroupMappings;
  saveMappings: SaveMappings;
  onDeletingChange?: (isDeleting: boolean) => void;
  groupLookup: GroupLookup;
  disabled?: boolean;
  readOnly?: boolean;
  lockedEnvName?: string;
  namesValidatedOnSave?: boolean;
  nameLabel: string;
  namePlaceholder: string;
};

/** One provider's manual group mappings, with their header and inline editor */
export function GroupMappingsPanel({
  mappings,
  saveMappings,
  onDeletingChange,
  groupLookup,
  disabled = false,
  readOnly = false,
  lockedEnvName,
  namesValidatedOnSave,
  nameLabel,
  namePlaceholder,
}: GroupMappingsPanelProps) {
  const deletion = useMappingDeletion({
    mappings,
    saveMappings,
    onDeletingChange,
    groupLookup,
  });
  const editor = useMappingEditor({
    mappings,
    saveMappings,
    groupLookup,
    namesValidatedOnSave,
  });
  const isDisabled =
    disabled ||
    editor.isSubmitting ||
    deletion.isDeleting ||
    !groupLookup.isLoaded;
  const isReadOnly = readOnly || lockedEnvName != null;

  return (
    <Stack gap="sm">
      <Flex justify="space-between" align="center" gap="lg">
        <Text fw="bold">{t`Manual group mappings`}</Text>
        {!isReadOnly && editor.draft == null && (
          <Button
            variant="subtle"
            flex="0 0 auto"
            leftSection={<Icon name="add" aria-hidden />}
            disabled={isDisabled}
            onClick={editor.startNew}
          >{t`New`}</Button>
        )}
      </Flex>
      {lockedEnvName != null && (
        <Text c="text-secondary">{t`Using ${lockedEnvName}`}</Text>
      )}
      {groupLookup.loadFailed && (
        <Text c="error">{t`Groups could not be loaded`}</Text>
      )}
      <GroupMappingList
        mappings={mappings}
        groupLookup={groupLookup}
        editor={editor}
        deletion={deletion}
        readOnly={isReadOnly}
        disabled={isDisabled}
        nameLabel={nameLabel}
        namePlaceholder={namePlaceholder}
        emptyMessage={t`No mappings yet`}
      />
    </Stack>
  );
}
