import { useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useGetSettingQuery, useUpdateSettingMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Radio, Stack, Text } from "metabase/ui";
import type { WorkspaceMode } from "metabase-types/api";

const DEFAULT_MODE: WorkspaceMode = "main";

export function WorkspaceModePage() {
  const { data: currentMode } = useGetSettingQuery("workspace-mode");
  const [updateSetting, { isLoading: isSaving }] = useUpdateSettingMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const initial = (currentMode as WorkspaceMode | undefined) ?? DEFAULT_MODE;
  const [mode, setMode] = useState<WorkspaceMode>(initial);
  const isDirty = mode !== initial;

  const handleSave = async () => {
    const { error } = await updateSetting({
      key: "workspace-mode",
      value: mode,
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace mode`);
    } else {
      sendSuccessToast(t`Workspace mode updated`);
    }
  };

  return (
    <SettingsPageWrapper title={t`Workspace mode`}>
      <SettingsSection>
        <Radio.Group
          value={mode}
          onChange={(value) => setMode(value as WorkspaceMode)}
        >
          <Stack>
            <Radio
              value="main"
              label={
                <Text fw={700} lh="1.25rem" mb="xs">
                  {t`Main instance`}
                </Text>
              }
              description={
                <Text c="text-secondary" lh="1.25rem" component="span">
                  {t`Manage workspaces from this instance. Use this for production.`}
                </Text>
              }
            />
            <Radio
              value="development"
              label={
                <Text fw={700} lh="1.25rem" mb="xs">
                  {t`Development instance`}
                </Text>
              }
              description={
                <Text c="text-secondary" lh="1.25rem" component="span">
                  {t`Use a workspace from a main instance to iterate on transforms in isolation, without affecting production.`}
                </Text>
              }
            />
          </Stack>
        </Radio.Group>
      </SettingsSection>
      <Group justify="flex-end">
        <Button
          variant="filled"
          loading={isSaving}
          disabled={!isDirty}
          onClick={handleSave}
        >{t`Save`}</Button>
      </Group>
    </SettingsPageWrapper>
  );
}
