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
  // reports deletions to a page whose other controls write the same setting
  onDeletingChange?: (isDeleting: boolean) => void;
  groupLookup: GroupLookup;
  // set by the page while it writes or refetches the mappings, since a row edit would race that
  disabled?: boolean;
  // locks the mappings for a reason the page explains elsewhere
  readOnly?: boolean;
  // the env var that owns the mappings, which locks them and is named above the rows
  lockedEnvName?: string;
  nameLabel: string;
  namePlaceholder: string;
};

/** The manual group mappings of one provider: a header, the rows, and the editor the rows open */
export function GroupMappingsPanel({
  mappings,
  saveMappings,
  onDeletingChange,
  groupLookup,
  disabled = false,
  readOnly = false,
  lockedEnvName,
  nameLabel,
  namePlaceholder,
}: GroupMappingsPanelProps) {
  const deletion = useMappingDeletion({
    mappings,
    saveMappings,
    onDeletingChange,
    groupLookup,
  });
  const editor = useMappingEditor({ mappings, saveMappings, groupLookup });
  // a mapping's ids only read right once the groups have arrived, so the panel waits for them too
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
            // the heading wraps before the button does, so the button keeps its whole label
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
