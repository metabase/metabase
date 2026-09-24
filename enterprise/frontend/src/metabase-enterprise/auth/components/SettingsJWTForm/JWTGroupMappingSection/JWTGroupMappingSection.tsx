import { t } from "ttag";

import {
  GroupMappingList,
  type GroupMappingsState,
  useGroupLookup,
  useMappingDeletion,
  useMappingEditor,
} from "metabase/admin/settings/auth/components/GroupMappings";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Flex, Icon, SegmentedControl, Stack, Text } from "metabase/ui";

import {
  type JWTGroupSyncMode,
  useGroupMappingMode,
} from "./use-group-mapping-mode";
import { useGroupMappingSettings } from "./use-group-mapping-settings";

type JWTGroupMappingSectionProps = {
  // until the server settings are saved, the section is read-only
  isServerConfigured: boolean;
  // env vars that configure the section, which then renders read-only
  lockedEnvNames?: string[];
};

export function JWTGroupMappingSection({
  isServerConfigured,
  lockedEnvNames = [],
}: JWTGroupMappingSectionProps) {
  const applicationName = useSelector(getApplicationName);
  const groupLookup = useGroupLookup();
  const groupMapping = useGroupMappingSettings();
  const modeSwitch = useGroupMappingMode(groupMapping);

  // saving a mapping always turns sync on, since a mapping is only meaningful while it is
  const editorStore: GroupMappingsState = {
    mappings: groupMapping.mappings,
    saveMappings: (mappings, options) =>
      groupMapping.saveSettings(
        { "jwt-group-sync": true, "jwt-group-mappings": mappings },
        options,
      ),
  };

  // deleting the last mapping turns sync off, otherwise the backend falls back to matching by name
  const deletionStore: GroupMappingsState = {
    mappings: groupMapping.mappings,
    saveMappings: (mappings, options) =>
      groupMapping.saveSettings(
        Object.keys(mappings).length === 0
          ? { "jwt-group-mappings": mappings, "jwt-group-sync": false }
          : { "jwt-group-mappings": mappings },
        options,
      ),
  };

  const editor = useMappingEditor({ groupMapping: editorStore, groupLookup });
  const deletion = useMappingDeletion({
    groupMapping: deletionStore,
    groupLookup,
    lastMappingDeletedMessage: t`Mapping deleted and group mapping turned off`,
  });
  // a settings refetch still in flight could overwrite a new write, so the section waits for it too
  const isBusy =
    groupMapping.isSaving ||
    groupMapping.isAdminSettingsFetching ||
    deletion.isDeleting;

  const isLocked = lockedEnvNames.length > 0;
  const isReadOnly = isLocked || !isServerConfigured;
  const isLastMapping = Object.keys(groupMapping.mappings).length === 1;

  return (
    <Stack gap="lg">
      <Flex justify="space-between" align="center" wrap="wrap" gap="lg">
        <SegmentedControl<JWTGroupSyncMode>
          aria-label={t`Group mapping mode`}
          value={modeSwitch.mode}
          onChange={(nextMode) => {
            editor.cancel();
            modeSwitch.select(nextMode);
          }}
          disabled={isReadOnly}
          // read-only keeps the options focusable, so a keyboard user keeps their place during a write
          readOnly={isBusy}
          data={[
            { label: t`Automatic`, value: "automatic" },
            { label: t`Manual`, value: "manual" },
            { label: t`Off`, value: "off" },
          ]}
        />
        {modeSwitch.mode === "manual" && !isReadOnly && (
          <Button
            variant="subtle"
            // the heading wraps before the button does, so the button keeps its whole label
            flex="0 0 auto"
            leftSection={<Icon name="add" aria-hidden />}
            disabled={isBusy}
            onClick={editor.startNew}
          >{t`New mapping`}</Button>
        )}
      </Flex>

      {lockedEnvNames.map((envName) => (
        <Text key={envName} c="text-secondary">{t`Using ${envName}`}</Text>
      ))}

      {modeSwitch.mode === "automatic" && (
        <Text c="text-secondary">
          {t`Users will be assigned to ${applicationName} groups based on their JWT group names`}
        </Text>
      )}

      {modeSwitch.mode === "manual" && (
        <GroupMappingList
          mappings={groupMapping.mappings}
          groupLookup={groupLookup}
          editor={editor}
          deletion={deletion}
          readOnly={isReadOnly}
          disabled={isBusy}
          nameLabel={t`JWT group name`}
          namePlaceholder={t`Enter JWT group...`}
          emptyMessage={t`Add at least one mapping to use manual group mapping`}
          deleteNote={
            isLastMapping
              ? t`This is the last mapping, so group mapping will be turned off.`
              : undefined
          }
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
