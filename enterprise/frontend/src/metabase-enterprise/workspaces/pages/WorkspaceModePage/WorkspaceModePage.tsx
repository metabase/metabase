import { useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils";
import { Button, Group, Radio, Stack, Text } from "metabase/ui";
import { WORKSPACE_MODES } from "metabase-types/api";

export function WorkspaceModePage() {
  const {
    value: initialMode,
    updateSetting,
    isLoading,
  } = useAdminSetting("workspace-mode");
  const [mode, setMode] = useState(initialMode);
  const isDirty = mode !== initialMode;

  const handleChange = (newValue: string) => {
    const newMode = WORKSPACE_MODES.find((mode) => mode === newValue);
    if (newMode) {
      setMode(newMode);
    }
  };

  const handleSave = async () => {
    await updateSetting({
      key: "workspace-mode",
      value: mode,
    });
  };

  return (
    <SettingsPageWrapper title={t`Workspace mode`}>
      <SettingsSection>
        <Radio.Group value={mode} onChange={handleChange}>
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
          disabled={isLoading || !isDirty}
          onClick={handleSave}
        >
          {t`Save`}
        </Button>
      </Group>
    </SettingsPageWrapper>
  );
}
