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
  readOnly?: boolean;
  // says why the mappings cannot be edited, already styled by the caller
  note?: React.ReactNode;
  nameLabel: string;
  namePlaceholder: string;
};

/** The manual group mappings of one provider: a header, the rows, and the editor the rows open */
export function GroupMappingsPanel({
  groupMapping,
  groupLookup,
  isBusy = false,
  readOnly = false,
  note,
  nameLabel,
  namePlaceholder,
}: GroupMappingsPanelProps) {
  const deletion = useMappingDeletion({ groupMapping, groupLookup });
  const editor = useMappingEditor({ groupMapping, groupLookup });
  // the editor and the deletion own their in-flight flags, so the panel releases as soon as they do
  const isDisabled = isBusy || editor.isSubmitting || deletion.isDeleting;

  return (
    <Stack gap="sm">
      <Flex justify="space-between" align="center" gap="lg">
        <Text fw="bold">{t`Manual group mappings`}</Text>
        {!readOnly && editor.draft == null && (
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
      {note}
      <GroupMappingList
        mappings={groupMapping.mappings}
        groupLookup={groupLookup}
        editor={editor}
        deletion={deletion}
        readOnly={readOnly}
        disabled={isDisabled}
        nameLabel={nameLabel}
        namePlaceholder={namePlaceholder}
        emptyMessage={t`No mappings yet`}
      />
    </Stack>
  );
}
