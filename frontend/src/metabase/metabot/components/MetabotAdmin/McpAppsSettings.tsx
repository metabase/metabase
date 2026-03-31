import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useAdminSetting } from "metabase/api/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Box, Checkbox, Stack, Text, TextInput } from "metabase/ui";

import { MetabotNavPane } from "./MetabotNavPane";

const getMcpClients = () =>
  [
    {
      key: "claude",
      label: t`Claude`,
      description: t`Claude Web and Claude Desktop`,
    },
    {
      key: "vscode",
      label: t`Cursor & VS Code`,
      description: t`Cursor and VS Code via GitHub Copilot`,
    },
    {
      key: "chatgpt",
      label: t`ChatGPT`,
      description: t`ChatGPT Web`,
    },
  ] as const;

export const McpAppsSettings = () => (
  <AdminSettingsLayout sidebar={<MetabotNavPane />}>
    <SettingsSection
      title={t`MCP Apps`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin UI
      description={t`Allow MCP app clients to connect to your Metabase instance by enabling CORS for their sandbox domains.`}
    >
      <CommonMcpClientsSection />

      <CustomMcpOriginsSection />
    </SettingsSection>
  </AdminSettingsLayout>
);

function CommonMcpClientsSection() {
  const mcpClients = getMcpClients();

  const { value: savedValue, updateSetting } = useAdminSetting(
    "common-mcp-apps-cors-origins",
  );

  const [enabledClients, setEnabledClients] = useState<string[]>(
    savedValue ?? [],
  );

  useEffect(() => {
    setEnabledClients(savedValue ?? []);
  }, [savedValue]);

  const handleToggle = useCallback(
    (clientKey: string, checked: boolean) => {
      const updated = checked
        ? [...enabledClients, clientKey]
        : enabledClients.filter((k) => k !== clientKey);

      setEnabledClients(updated);

      updateSetting({
        key: "common-mcp-apps-cors-origins",
        value: updated,
      });
    },
    [enabledClients, updateSetting],
  );

  return (
    <Box>
      <SettingHeader
        id="common-mcp-clients"
        title={t`Supported MCP clients`}
        description={t`Select which MCP app clients you want to allow. Their sandbox domains will be automatically added to the CORS allowlist.`}
      />
      <Stack gap="md" mt="md">
        {mcpClients.map(({ key, label, description }) => (
          <Checkbox
            key={key}
            data-testid={`mcp-client-${key}`}
            checked={enabledClients.includes(key)}
            onChange={(e) => handleToggle(key, e.target.checked)}
            styles={{ body: { alignItems: "flex-start" } }}
            label={
              <Box>
                <Text fw="bold">{label}</Text>
                <Text c="text-secondary" fz="sm">
                  {description}
                </Text>
              </Box>
            }
          />
        ))}
      </Stack>
    </Box>
  );
}

function CustomMcpOriginsSection() {
  const { value: savedValue, updateSetting } = useAdminSetting(
    "custom-mcp-apps-cors-origins",
  );

  const [localValue, setLocalValue] = useState(savedValue ?? "");

  useEffect(() => {
    setLocalValue(savedValue ?? "");
  }, [savedValue]);

  const handleBlur = useCallback(() => {
    if (localValue !== savedValue) {
      updateSetting({
        key: "custom-mcp-apps-cors-origins",
        value: localValue,
      });
    }
  }, [localValue, savedValue, updateSetting]);

  return (
    <Box>
      <SettingHeader
        id="custom-mcp-origins"
        title={t`Custom MCP client domains`}
        description={t`For self-hosted MCP clients. Separate values with a space.`}
      />
      <TextInput
        mt="md"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="https://*.example.com"
      />
      <Text c="text-tertiary" fz="sm" mt="xs">
        {t`Changes will take effect within one minute.`}
      </Text>
    </Box>
  );
}
