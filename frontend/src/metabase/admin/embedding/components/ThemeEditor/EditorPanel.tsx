import { t } from "ttag";

import type { EmbeddingThemeEditorResult } from "metabase/admin/embedding/hooks/use-embedding-theme-editor";
import { ColorPickerContent } from "metabase/common/components/ColorPicker/ColorPickerContent";
import type { MetabaseColor } from "metabase/embedding-sdk/theme";
import {
  Box,
  Button,
  Card,
  Flex,
  Popover,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

const PRIMARY_COLORS: {
  key: Exclude<MetabaseColor, "charts">;
  label: () => string;
}[] = [
  { key: "brand", label: () => t`Brand` },
  { key: "background", label: () => t`Background` },
  { key: "text-primary", label: () => t`Primary text` },
];

interface EditorPanelProps {
  editor: EmbeddingThemeEditorResult;
  onCancel: () => void;
}

export function EditorPanel({ editor, onCancel }: EditorPanelProps) {
  const { currentTheme } = editor;
  if (!currentTheme) {
    return null;
  }

  const colors = currentTheme.settings.colors ?? {};

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

          {/* Main colors */}
          <Card withBorder p="lg">
            <Text fw={600} fz="sm" mb="sm">{t`Main colors`}</Text>
            <Flex gap="sm">
              {PRIMARY_COLORS.map(({ key, label }) => (
                <ColorSwatchCard
                  key={key}
                  label={label()}
                  value={(colors[key] as string) ?? ""}
                  onChange={(color) => editor.setColor(key, color ?? "")}
                />
              ))}
            </Flex>
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

function ColorSwatchCard({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color?: string) => void;
}) {
  return (
    <Popover position="bottom" shadow="md">
      <Popover.Target>
        <Card withBorder p="sm" style={{ cursor: "pointer", flex: 1 }}>
          <Flex
            h={48}
            direction="column"
            align="center"
            justify="space-evenly"
            pt={2}
          >
            <Box
              w={20}
              h={20}
              style={{
                borderRadius: "50%",
                backgroundColor: value || "transparent",
                border: "1px solid var(--mb-color-border)",
              }}
            />
            <Text fz={10}>{label}</Text>
          </Flex>
        </Card>
      </Popover.Target>
      <Popover.Dropdown>
        <ColorPickerContent value={value} onChange={onChange} />
      </Popover.Dropdown>
    </Popover>
  );
}
