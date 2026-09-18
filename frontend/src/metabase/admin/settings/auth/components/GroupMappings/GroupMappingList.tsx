import { t } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Stack, Text } from "metabase/ui";

import { DeleteGroupMappingModal } from "./DeleteGroupMappingModal";
import { MappingEditorRow } from "./MappingEditorRow";
import { MappingRow } from "./MappingRow";
import type { MappingsType } from "./types";
import type { MappingDeletionState } from "./use-mapping-deletion";
import type { MappingEditorState } from "./use-mapping-editor";
import type { GroupLookup } from "./utils";

type GroupMappingListProps = {
  mappings: MappingsType;
  groupLookup: GroupLookup;
  editor: MappingEditorState;
  deletion: MappingDeletionState;
  readOnly: boolean;
  disabled: boolean;
  nameLabel: string;
  namePlaceholder: string;
  emptyMessage: string;
  // a warning the delete confirmation shows, for instance that this is the last mapping
  deleteNote?: string;
};

/** The mapping rows with the inline editor and the delete confirmation, driven by the caller's hooks */
export function GroupMappingList({
  mappings,
  groupLookup,
  editor,
  deletion,
  readOnly,
  disabled,
  nameLabel,
  namePlaceholder,
  emptyMessage,
  deleteNote,
}: GroupMappingListProps) {
  const { draft } = editor;
  const hasMappings = Object.keys(mappings).length > 0;
  const groupOptions = groupLookup.mappableGroups.map((group) => ({
    value: String(group.id),
    label: getGroupNameLocalized(group),
  }));
  const editorRowProps = {
    groupOptions,
    nameLabel,
    namePlaceholder,
    canSubmit: editor.canSave,
    nameError: editor.nameError,
    isSubmitting: disabled || editor.isSubmitting,
    onChange: editor.change,
    onCancel: editor.cancel,
    onSubmit: editor.save,
  };

  return (
    <>
      <Stack gap="sm">
        {!hasMappings && draft == null && !readOnly && (
          <Text c="text-secondary">{emptyMessage}</Text>
        )}
        {Object.entries(mappings).map(([name, groupIds]) =>
          draft?.originalName === name ? (
            <MappingEditorRow
              key={name}
              draft={draft}
              submitLabel={t`Save`}
              {...editorRowProps}
            />
          ) : (
            <MappingRow
              key={name}
              name={name}
              groupIds={groupIds}
              groupLookup={groupLookup}
              readOnly={readOnly}
              disabled={disabled}
              onEdit={() => editor.startEdit(name, groupIds)}
              onDelete={() => deletion.requestDelete(name)}
            />
          ),
        )}
        {draft != null && draft.originalName == null && (
          <MappingEditorRow
            draft={draft}
            submitLabel={t`Add mapping`}
            {...editorRowProps}
          />
        )}
      </Stack>
      {deletion.target != null && (
        <DeleteGroupMappingModal
          name={deletion.target}
          groupIds={deletion.targetGroupIds}
          hasAdminGroup={groupLookup.hasAdminGroup(deletion.targetGroupIds)}
          note={deleteNote}
          onConfirm={deletion.confirmDelete}
          onHide={deletion.cancelDelete}
        />
      )}
    </>
  );
}
