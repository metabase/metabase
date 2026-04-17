import { useCallback, useState } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useAdminSetting } from "metabase/api/utils";
import { Box, Stack, Switch, Text, TextInput } from "metabase/ui";

const getMcpClients = () =>
  [
    {
      key: "claude",
      label: t`Claude`,
    },
    {
      key: "cursor-vscode",
      label: t`Cursor and VS Code`,
    },
    {
      key: "chatgpt",
      label: t`ChatGPT`,
    },
  ] as const;

export const McpAppsSettings = () => (
  <SettingsSection
    title={t`MCP apps`}
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin UI
    description={t`Allow MCP clients to connect to your Metabase instance by enabling CORS for their sandbox domains.`}
  >
    <CommonMcpClientsSection />

    <CustomMcpOriginsSection />
  </SettingsSection>
);

function CommonMcpClientsSection() {
  const mcpClients = getMcpClients();

  const { value: savedValue, updateSetting } = useAdminSetting(
    "mcp-apps-cors-enabled-clients",
  );

  const [enabledClients, setEnabledClients] = useState<string[]>(
    savedValue ?? [],
  );

  const handleToggle = useCallback(
    (clientKey: string, checked: boolean) => {
      const updated = checked
        ? [...enabledClients, clientKey]
        : enabledClients.filter((k) => k !== clientKey);

      setEnabledClients(updated);

      updateSetting({
        key: "mcp-apps-cors-enabled-clients",
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
        description={t`Select which MCP clients you want to allow. Their sandbox domains will be automatically added to the CORS allowlist.`}
      />
      <Stack gap="md" mt="md">
        {mcpClients.map(({ key, label }) => (
          <Switch
            key={key}
            data-testid={`mcp-client-${key}`}
            checked={enabledClients.includes(key)}
            onChange={(e) => handleToggle(key, e.target.checked)}
            label={label}
            size="sm"
            w="auto"
          />
        ))}
      </Stack>
    </Box>
  );
}

function CustomMcpOriginsSection() {
  const { value: savedValue, updateSetting } = useAdminSetting(
    "mcp-apps-cors-custom-origins",
  );

  const [localValue, setLocalValue] = useState(savedValue ?? "");

  const handleBlur = useCallback(() => {
    if (localValue !== savedValue) {
      updateSetting({
        key: "mcp-apps-cors-custom-origins",
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
