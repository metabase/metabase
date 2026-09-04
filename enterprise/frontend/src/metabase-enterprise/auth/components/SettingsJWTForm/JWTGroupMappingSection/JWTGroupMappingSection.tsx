import { useMemo, useState } from "react";
import { t } from "ttag";

import { DeleteGroupMappingModal } from "metabase/admin/settings/components/widgets/GroupMappingsWidget/DeleteGroupMappingModal";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Flex, Icon, SegmentedControl, Stack, Text } from "metabase/ui";

import { type EditorState, MappingEditorRow } from "./MappingEditorRow";
import { MappingRow } from "./MappingRow";
import { useGroupMappingMode } from "./use-group-mapping-mode";
import { useGroupMappingSettings } from "./use-group-mapping-settings";
import { useMappingDeletion } from "./use-mapping-deletion";
import {
  type JWTGroupSyncMode,
  createGroupLookup,
  withMappingEntry,
} from "./utils";

export function JWTGroupMappingSection({
  isServerConfigured,
  lockedEnvNames = [],
}: {
  // until the server settings are saved, the section is read-only
  isServerConfigured: boolean;
  // env vars that configure the section, which then renders read-only
  lockedEnvNames?: string[];
}) {
  const applicationName = useSelector(getApplicationName);
  const { data: groups = [] } = useListPermissionsGroupsQuery({});
  const groupLookup = useMemo(() => createGroupLookup(groups), [groups]);
  const groupMapping = useGroupMappingSettings();
  const deletion = useMappingDeletion({ groupMapping, groupLookup });
  const modeSwitch = useGroupMappingMode(groupMapping);
  const isBusy = groupMapping.isSaving || deletion.isDeleting;
  const [editor, setEditor] = useState<EditorState | null>(null);

  const isLocked = lockedEnvNames.length > 0;
  const isReadOnly = isLocked || !isServerConfigured;

  const trimmedJwtGroupName = editor?.jwtGroupName.trim() ?? "";
  const isDuplicateName =
    editor != null &&
    Object.hasOwn(groupMapping.mappings, trimmedJwtGroupName) &&
    trimmedJwtGroupName !== editor.originalJwtGroupName;
  const canSaveMapping =
    editor != null &&
    trimmedJwtGroupName !== "" &&
    editor.groupValues.length > 0 &&
    !isDuplicateName;

  const saveMapping = async () => {
    if (editor == null || !canSaveMapping) {
      return;
    }
    const isNewMapping = editor.originalJwtGroupName == null;
    const saved = await groupMapping.saveSettings(
      {
        "jwt-group-sync": true,
        "jwt-group-mappings": withMappingEntry(
          groupMapping.mappings,
          editor.originalJwtGroupName,
          trimmedJwtGroupName,
          editor.groupValues.map(Number),
        ),
      },
      {
        successMessage: isNewMapping ? t`Mapping added` : t`Mapping updated`,
      },
    );
    if (saved) {
      setEditor(null);
    }
  };

  const groupOptions = groupLookup.mappableGroups.map((group) => ({
    value: String(group.id),
    label: getGroupNameLocalized(group),
  }));

  return (
    <Stack gap="lg">
      <Flex justify="space-between" align="center" wrap="wrap" gap="lg">
        <SegmentedControl<JWTGroupSyncMode>
          aria-label={t`Group mapping mode`}
          value={modeSwitch.mode}
          onChange={(nextMode) => {
            setEditor(null);
            modeSwitch.select(nextMode);
          }}
          disabled={isReadOnly || isBusy}
          data={[
            { label: t`Automatic`, value: "automatic" },
            { label: t`Manual`, value: "manual" },
            { label: t`Off`, value: "off" },
          ]}
        />
        {modeSwitch.mode === "manual" && !isReadOnly && (
          <Button
            variant="subtle"
            leftSection={<Icon name="add" aria-hidden />}
            disabled={isBusy}
            onClick={() =>
              setEditor({
                jwtGroupName: "",
                groupValues: [],
                originalJwtGroupName: null,
              })
            }
          >{t`New mapping`}</Button>
        )}
      </Flex>

      {isLocked &&
        lockedEnvNames.map((envName) => (
          <Text key={envName} c="text-secondary">{t`Using ${envName}`}</Text>
        ))}

      {modeSwitch.mode === "automatic" && (
        <Text c="text-secondary">
          {t`Users will be assigned to ${applicationName} groups based on their JWT group names`}
        </Text>
      )}

      {modeSwitch.mode === "manual" && (
        <Stack gap="sm">
          {!modeSwitch.hasMappings && editor == null && !isReadOnly && (
            <Text c="text-secondary">
              {t`Add at least one mapping to use manual group mapping`}
            </Text>
          )}
          {Object.entries(groupMapping.mappings).map(([name, groupIds]) =>
            editor?.originalJwtGroupName === name ? (
              <MappingEditorRow
                key={name}
                editor={editor}
                groupOptions={groupOptions}
                submitLabel={t`Save`}
                canSubmit={canSaveMapping}
                isDuplicateName={isDuplicateName}
                isSubmitting={isBusy}
                onChange={setEditor}
                onCancel={() => setEditor(null)}
                onSubmit={saveMapping}
              />
            ) : (
              <MappingRow
                key={name}
                name={name}
                groupIds={groupIds}
                groupLookup={groupLookup}
                readOnly={isReadOnly}
                disabled={isBusy}
                onEdit={() =>
                  setEditor({
                    jwtGroupName: name,
                    groupValues: groupLookup.existingIds(groupIds).map(String),
                    originalJwtGroupName: name,
                  })
                }
                onDelete={() => deletion.requestDelete(name)}
              />
            ),
          )}
          {editor != null && editor.originalJwtGroupName == null && (
            <MappingEditorRow
              editor={editor}
              groupOptions={groupOptions}
              submitLabel={t`Add mapping`}
              canSubmit={canSaveMapping}
              isDuplicateName={isDuplicateName}
              isSubmitting={isBusy}
              onChange={setEditor}
              onCancel={() => setEditor(null)}
              onSubmit={saveMapping}
            />
          )}
        </Stack>
      )}

      {deletion.target != null && (
        <DeleteGroupMappingModal
          name={deletion.target}
          groupIds={deletion.targetGroupIds}
          hasAdminGroup={groupLookup.hasAdminGroup(deletion.targetGroupIds)}
          note={
            deletion.isDeletingLastMapping
              ? t`This is the last mapping, so group mapping will be turned off.`
              : undefined
          }
          onConfirm={deletion.confirmDelete}
          onHide={deletion.cancelDelete}
        />
      )}
      <ConfirmModal
        opened={modeSwitch.isClearConfirmOpen}
        title={t`Switch to automatic group mapping?`}
        message={t`Your existing group mappings will be deleted, and users will be assigned to ${applicationName} groups matching their JWT group names.`}
        confirmButtonText={t`Delete mappings and switch`}
        onClose={modeSwitch.cancelClear}
        // the modal's busy guard only engages on a returned promise, which also blocks double submits
        onConfirm={modeSwitch.confirmClear}
      />
    </Stack>
  );
}
