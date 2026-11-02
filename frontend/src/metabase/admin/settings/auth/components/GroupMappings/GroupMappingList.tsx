import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Stack, Text } from "metabase/ui";
import type { GroupMappings } from "metabase-types/api";

import { DeleteGroupMappingModal } from "./DeleteGroupMappingModal";
import { MappingEditorRow } from "./MappingEditorRow";
import { MappingRow } from "./MappingRow";
import type { MappingDeletionState } from "./use-mapping-deletion";
import type { MappingEditorState } from "./use-mapping-editor";
import type { GroupLookup } from "./utils";

type GroupMappingListProps = {
  mappings: GroupMappings;
  groupLookup: GroupLookup;
  editor: MappingEditorState;
  deletion: MappingDeletionState;
  readOnly: boolean;
  disabled: boolean;
  nameLabel: string;
  namePlaceholder: string;
  emptyMessage: string;
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
    // a hold for another reason blocks only the submit, so the draft stays editable
    canSubmit: editor.canSave && !disabled,
    nameError: editor.nameError,
    saveError: editor.saveError,
    isSubmitting: editor.isSubmitting,
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
        {draft != null && editor.isDraftNew && (
          <MappingEditorRow
            draft={draft}
            submitLabel={t`Add mapping`}
            {...editorRowProps}
          />
        )}
      </Stack>
      {deletion.target != null && (
        <DeleteGroupMappingModal
          mappingName={deletion.target}
          clearedGroups={groupLookup.actionableGroupNames(
            deletion.targetGroupIds,
            "clear",
          )}
          keptOnClear={groupLookup.keptGroupNames(
            deletion.targetGroupIds,
            "clear",
          )}
          deletedGroups={groupLookup.actionableGroupNames(
            deletion.targetGroupIds,
            "delete",
          )}
          keptOnDelete={groupLookup.keptGroupNames(
            deletion.targetGroupIds,
            "delete",
          )}
          note={deleteNote}
          onConfirm={deletion.confirmDelete}
          onHide={deletion.cancelDelete}
        />
      )}
      <LeaveRouteConfirmModal isEnabled={editor.hasUnsavedChanges} />
    </>
  );
}
