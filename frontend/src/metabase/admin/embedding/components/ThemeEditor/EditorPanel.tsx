import { useState } from "react";
import { t } from "ttag";

import type { EmbeddingThemeEditorResult } from "metabase/admin/embedding/hooks/use-embedding-theme-editor";
import { ColorPicker } from "metabase/common/components/ColorPicker";
import type { MetabaseFontFamily } from "metabase/embedding-sdk/theme/fonts";
import {
  Box,
  Button,
  Card,
  Collapse,
  Flex,
  Icon,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";

import { ColorRow } from "./ColorRow";
import { ColorSwatchCard } from "./ColorSwatchCard";
import {
  CHART_COLOR_COUNT,
  FONT_FAMILY_OPTIONS,
  MORE_COLORS,
  PRIMARY_COLORS,
} from "./constants";

interface EditorPanelProps {
  editor: EmbeddingThemeEditorResult;
  onCancel: () => void;
}

export function EditorPanel({ editor, onCancel }: EditorPanelProps) {
  const [moreColorsOpen, setMoreColorsOpen] = useState(false);

  const { currentTheme } = editor;
  if (!currentTheme) {
    return null;
  }

  const colors = currentTheme.settings.colors ?? {};
  const charts = colors.charts ?? [];

  const parseFontSizeNumber = (fontSize: string | undefined): string => {
    if (!fontSize) {
      return "";
    }
    const num = parseFloat(fontSize);
    return isNaN(num) ? "" : String(num);
  };

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

            <Flex mt="sm" align="center" justify="space-between">
              <UnstyledButton onClick={() => setMoreColorsOpen((v) => !v)}>
                <Flex align="center" gap="xs">
                  <Text c="brand" fz="sm" fw={600}>
                    {moreColorsOpen
                      ? t`Hide additional colors`
                      : t`Show more colors`}
                  </Text>
                  <Icon
                    name={moreColorsOpen ? "chevronup" : "chevronright"}
                    size={12}
                    c="brand"
                  />
                </Flex>
              </UnstyledButton>

              {moreColorsOpen && editor.hasAdditionalColorChanges && (
                <Button
                  variant="subtle"
                  size="compact-sm"
                  aria-label={t`Revert to default colors`}
                  onClick={editor.resetAdditionalColors}
                  px="xs"
                >
                  <Icon name="revert" size={16} />
                </Button>
              )}
            </Flex>

            <Collapse in={moreColorsOpen}>
              <Stack gap="sm" mt="md">
                {MORE_COLORS.map(({ key, label }) => (
                  <ColorRow
                    key={key}
                    label={label()}
                    value={(colors[key] as string) ?? ""}
                    onChange={(color) => editor.setColor(key, color ?? "")}
                  />
                ))}

                <Text fw={600} fz="sm" mt="sm">{t`Chart colors`}</Text>
                <Flex gap="sm" wrap="wrap">
                  {Array.from({ length: CHART_COLOR_COUNT }, (_, i) => {
                    const chartColor = charts[i];
                    const value =
                      typeof chartColor === "object" && chartColor?.base
                        ? chartColor.base
                        : typeof chartColor === "string"
                          ? chartColor
                          : "";
                    return (
                      <ColorPicker
                        key={i}
                        value={value}
                        onChange={(color) =>
                          editor.setChartColor(i, color ?? "")
                        }
                      />
                    );
                  })}
                </Flex>
              </Stack>
            </Collapse>
          </Card>

          {/* Font */}
          <Card withBorder p="lg">
            <Stack gap="md">
              <Select
                label={t`Font`}
                data={FONT_FAMILY_OPTIONS}
                value={currentTheme.settings.fontFamily ?? ""}
                onChange={(value) =>
                  editor.setFontFamily((value ?? "") as MetabaseFontFamily)
                }
                clearable
                searchable
              />
              <TextInput
                label={t`Base font size`}
                value={parseFontSizeNumber(currentTheme.settings.fontSize)}
                onChange={(e) => {
                  const raw = e.currentTarget.value;
                  if (raw !== "" && !/^\d+$/.test(raw)) {
                    return;
                  }
                  editor.setFontSize(raw ? `${raw}px` : "");
                }}
                rightSection={
                  <Text c="text-tertiary" fz="sm">
                    {"px"}
                  </Text>
                }
              />
            </Stack>
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
