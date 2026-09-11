import { t } from "ttag";

import { DeleteGroupMappingModal } from "metabase/admin/settings/components/widgets/GroupMappingsWidget/DeleteGroupMappingModal";
import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Stack, Text } from "metabase/ui";

import { MappingEditorRow } from "./MappingEditorRow";
import { MappingRow } from "./MappingRow";
import type { GroupMappingsState } from "./use-group-mappings";
import type { MappingDeletionState } from "./use-mapping-deletion";
import type { MappingEditorState } from "./use-mapping-editor";
import type { GroupLookup } from "./utils";

/** The mapping rows with the inline editor and the delete confirmation, driven by the caller's hooks */
export function GroupMappingList({
  groupMapping,
  groupLookup,
  editor,
  deletion,
  readOnly,
  disabled,
  nameLabel,
  namePlaceholder,
  emptyMessage,
}: {
  groupMapping: GroupMappingsState;
  groupLookup: GroupLookup;
  editor: MappingEditorState;
  deletion: MappingDeletionState;
  // hides the row actions while something else owns the mappings, such as an env var
  readOnly: boolean;
  // blocks the row actions while a write or a cascade is in flight
  disabled: boolean;
  nameLabel: string;
  namePlaceholder: string;
  // shown in place of the rows while there are none to edit
  emptyMessage: string;
}) {
  const { draft } = editor;
  const hasMappings = Object.keys(groupMapping.mappings).length > 0;
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
    isSubmitting: disabled,
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
        {Object.entries(groupMapping.mappings).map(([name, groupIds]) =>
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
          onConfirm={deletion.confirmDelete}
          onHide={deletion.cancelDelete}
        />
      )}
    </>
  );
}
