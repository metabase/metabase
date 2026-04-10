import { t } from "ttag";

import type { EmbeddingThemeEditorResult } from "metabase/admin/embedding/hooks/use-embedding-theme-editor";
import { Box, Button, Card, Flex, Stack, Text, TextInput } from "metabase/ui";

interface EditorPanelProps {
  editor: EmbeddingThemeEditorResult;
  onCancel: () => void;
}

export function EditorPanel({ editor, onCancel }: EditorPanelProps) {
  const { currentTheme } = editor;
  if (!currentTheme) {
    return null;
  }

  return (
    <Flex
      direction="column"
      w="100%"
      maw={480}
      style={{ borderRight: "1px solid var(--mb-color-border)" }}
    >
      <Box flex={1} style={{ overflow: "auto" }} p="xl">
        <Text fw={700} fz="xl" mb="xl">{t`Edit theme`}</Text>

        <Stack gap="lg">
          {/* Theme name */}
          <Card withBorder p="lg">
            <TextInput
              label={t`Theme name`}
              value={currentTheme.name}
              onChange={(e) => editor.setName(e.currentTarget.value)}
            />
          </Card>
        </Stack>
      </Box>

      {/* Bottom action bar */}
      <Flex
        p="lg"
        gap="md"
        justify="space-between"
        style={{ borderTop: "1px solid var(--mb-color-border)" }}
      >
        <Button variant="subtle" onClick={onCancel}>
          {t`Cancel`}
        </Button>
        <Button
          variant="filled"
          onClick={editor.handleSave}
          disabled={!editor.isDirty}
        >
          {t`Save theme`}
        </Button>
      </Flex>
    </Flex>
  );
}
