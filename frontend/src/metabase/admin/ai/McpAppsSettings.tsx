import { useCallback, useState } from "react";
import { jt, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useAdminSetting } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Box, Flex, Stack, Switch, Text, TextInput } from "metabase/ui";

import { McpServerUrlSection } from "./MCPServerUrlSection";

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

export const McpAppsSettings = ({ id }: { id?: string }) => {
  const {
    value: mcpEnabled,
    updateSetting,
    isLoading,
  } = useAdminSetting("mcp-enabled?");

  const { url: mcpDocsUrl } = useDocsUrl("ai/mcp");

  const isEnabled = mcpEnabled !== false;

  return (
    <SettingsSection
      id={id}
      title={
        <Flex align="center" gap="md" justify="space-between" w="100%">
          <div>{t`MCP server`}</div>
          <Switch
            aria-label={t`MCP server`}
            checked={isEnabled}
            disabled={isLoading}
            onChange={(event) =>
              updateSetting({
                key: "mcp-enabled?",
                value: event.target.checked,
              })
            }
            size="sm"
            w="auto"
          />
        </Flex>
      }
      description={jt`Allow MCP clients to connect to your Metabase instance. ${(
        <ExternalLink key="docs" href={mcpDocsUrl}>
          {t`Learn more`}
        </ExternalLink>
      )}`}
    >
      {isEnabled && (
        <Stack gap="lg">
          <CommonMcpClientsSection />

          <CustomMcpOriginsSection />
        </Stack>
      )}
      <McpServerUrlSection />
    </SettingsSection>
  );
};

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
