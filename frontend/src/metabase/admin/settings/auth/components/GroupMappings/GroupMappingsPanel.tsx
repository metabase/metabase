import { t } from "ttag";

import { Button, Flex, Icon, Stack, Text } from "metabase/ui";

import { GroupMappingList } from "./GroupMappingList";
import type { GroupMappingsState } from "./use-group-mappings";
import { useMappingDeletion } from "./use-mapping-deletion";
import { useMappingEditor } from "./use-mapping-editor";
import type { GroupLookup } from "./utils";

type GroupMappingsPanelProps = {
  groupMapping: GroupMappingsState;
  groupLookup: GroupLookup;
  // another reason the panel is busy, on top of its own save and delete
  isBusy?: boolean;
  // locks the mappings for a reason the page explains elsewhere
  readOnly?: boolean;
  // the env var that owns the mappings, which locks them and is named above the rows
  lockedEnvName?: string;
  nameLabel: string;
  namePlaceholder: string;
};

/** The manual group mappings of one provider: a header, the rows, and the editor the rows open */
export function GroupMappingsPanel({
  groupMapping,
  groupLookup,
  isBusy = false,
  readOnly = false,
  lockedEnvName,
  nameLabel,
  namePlaceholder,
}: GroupMappingsPanelProps) {
  const deletion = useMappingDeletion({ groupMapping, groupLookup });
  const editor = useMappingEditor({ groupMapping, groupLookup });
  // the editor and the deletion own their in-flight flags, so the panel releases as soon as they do
  const isDisabled = isBusy || editor.isSubmitting || deletion.isDeleting;
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
      <GroupMappingList
        mappings={groupMapping.mappings}
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
