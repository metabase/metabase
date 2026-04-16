import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useAdminSetting } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Box, Icon, TextInput, Tooltip } from "metabase/ui";

import S from "./MCPServerUrlSection.module.css";

export function McpServerUrlSection() {
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { value: siteUrl } = useAdminSetting("site-url");

  if (!siteUrl) {
    return null;
  }

  const mcpServerUrl = `${siteUrl}/api/mcp`;

  const onCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(mcpServerUrl);
      sendSuccessToast(t`MCP server URL copied to clipboard`);
    } catch {
      sendErrorToast(t`Error copying the MCP server URL to clipboard.`);
    }
  };

  return (
    <Box>
      <SettingHeader
        id="custom-mcp-origins"
        title={t`MCP server URL`}
        description={t`This is the MCP server URL you can use to connect.`}
      />
      <TextInput
        c="text-primary"
        readOnly
        mt="md"
        value={mcpServerUrl}
        rightSection={
          <Tooltip label={t`Copy to clipboard`}>
            <ActionIcon h="sm" onClick={onCopyClick}>
              <Icon name="copy" size="1rem" />
            </ActionIcon>
          </Tooltip>
        }
        classNames={{
          input: S.input,
        }}
      />
    </Box>
  );
}
