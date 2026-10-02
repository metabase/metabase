import { t } from "ttag";

import {
  GroupMappingList,
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

  const editor = useMappingEditor({
    mappings: groupMapping.mappings,
    saveMappings: (mappings, options) =>
      groupMapping.saveSettings(
        { "jwt-group-sync": true, "jwt-group-mappings": mappings },
        options,
      ),
    groupLookup,
  });
  const deletion = useMappingDeletion({
    mappings: groupMapping.mappings,
    // deleting the last mapping turns sync off, otherwise the backend falls back to matching by name
    saveMappings: (mappings, options) =>
      groupMapping.saveSettings(
        Object.keys(mappings).length === 0
          ? { "jwt-group-mappings": mappings, "jwt-group-sync": false }
          : { "jwt-group-mappings": mappings },
        options,
      ),
    groupLookup,
  });
  // a settings refetch still in flight could overwrite a new write, so the section waits for it too
  const isBusy =
    groupMapping.isSaving ||
    groupMapping.isAdminSettingsFetching ||
    deletion.isDeleting;
  const isListHeld = isBusy || !groupLookup.isLoaded;

  const isLocked = lockedEnvNames.length > 0;
  const isReadOnly = isLocked || !isServerConfigured;
  const isLockedUntilSave = !isServerConfigured && !isLocked;
  const isLastMapping = Object.keys(groupMapping.mappings).length === 1;
  const isNewMappingShown =
    modeSwitch.mode === "manual" && !isReadOnly && editor.draft == null;

  return (
    <Stack gap="lg">
      {isLockedUntilSave && (
        <Text c="text-secondary">
          {t`Save the settings above to set up group mapping.`}
        </Text>
      )}
      <Flex justify="space-between" align="center" wrap="wrap" gap="lg">
        <SegmentedControl<JWTGroupSyncMode>
          aria-label={t`Group mapping mode`}
          value={modeSwitch.mode}
          onChange={modeSwitch.select}
          // Enter must not submit the surrounding page form
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
          disabled={isReadOnly}
          // read-only, not disabled, so keyboard focus survives a write
          readOnly={isBusy}
          data={[
            { label: t`Automatic`, value: "automatic" },
            { label: t`Manual`, value: "manual" },
            { label: t`Off`, value: "off" },
          ]}
        />
        {isNewMappingShown && (
          <Button
            variant="subtle"
            flex="0 0 auto"
            leftSection={<Icon name="add" aria-hidden />}
            disabled={isListHeld}
            onClick={editor.startNew}
          >{t`New mapping`}</Button>
        )}
      </Flex>

      {lockedEnvNames.map((envName) => (
        <Text key={envName} c="text-secondary">{t`Using ${envName}`}</Text>
      ))}

      {modeSwitch.mode === "automatic" && (
        <Text c="text-secondary">
          {t`At each sign-in, people are added to the ${applicationName} groups named in their JWT and removed from all other groups, including Administrators.`}
        </Text>
      )}

      {modeSwitch.mode === "manual" && groupLookup.loadFailed && (
        <Text c="error">{t`Groups could not be loaded`}</Text>
      )}

      {modeSwitch.mode === "manual" && (
        <GroupMappingList
          mappings={groupMapping.mappings}
          groupLookup={groupLookup}
          editor={editor}
          deletion={deletion}
          readOnly={isReadOnly}
          disabled={isListHeld}
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
        message={t`Your existing group mappings will be deleted. From then on, at each sign-in, people are added to the ${applicationName} groups named in their JWT and removed from all other groups, including Administrators.`}
        confirmButtonText={t`Delete mappings and switch`}
        onClose={modeSwitch.cancelClear}
        // the modal's busy guard only engages on a returned promise, which also blocks double submits
        onConfirm={modeSwitch.confirmClear}
      />
    </Stack>
  );
}
