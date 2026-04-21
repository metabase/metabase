import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { Box } from "metabase/ui";

import S from "./MCPServerUrlSection.module.css";
import { useMCPServerURL } from "./utils";

export function McpServerUrlSection() {
  const mcpServerUrl = useMCPServerURL();

  if (!mcpServerUrl) {
    return null;
  }

  return (
    <Box>
      <SettingHeader
        id="custom-mcp-origins"
        title={t`MCP server URL`}
        description={t`This is the MCP server URL you can use to connect.`}
      />
      <CopyTextInput
        value={mcpServerUrl}
        classNames={{
          input: S.input,
        }}
        readOnly
        mt="md"
        c="text-primary"
      />
    </Box>
  );
}
