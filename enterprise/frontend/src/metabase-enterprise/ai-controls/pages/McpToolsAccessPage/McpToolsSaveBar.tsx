import { t } from "ttag";

import { Button, Group, Text } from "metabase/ui";

import S from "../../components/AccessTable.module.css";

type McpToolsSaveBarProps = {
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function McpToolsSaveBar({
  isSaving,
  onSave,
  onCancel,
}: McpToolsSaveBarProps) {
  return (
    <Group
      justify="space-between"
      className={S.buttonRow}
      data-testid="mcp-tool-access-save-bar"
    >
      <Text>{t`You've made changes to MCP tool access.`}</Text>
      <Group gap="sm">
        <Button variant="subtle" onClick={onCancel}>
          {t`Cancel`}
        </Button>
        <Button variant="filled" loading={isSaving} onClick={onSave}>
          {t`Save changes`}
        </Button>
      </Group>
    </Group>
  );
}
