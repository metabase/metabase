import { useMemo, useState } from "react";
import { t } from "ttag";

import type { EmbeddingThemeEditorResult } from "metabase/admin/embedding/hooks/use-embedding-theme-editor";
import type { MetabaseFontFamily } from "metabase/embedding-sdk/theme/fonts";
import {
  Box,
  Button,
  Card,
  Collapse,
  CopyButton,
  Flex,
  Icon,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";

import { ColorSwatchCard } from "./ColorSwatchCard";
import {
  CHART_COLOR_COUNT,
  FONT_FAMILY_OPTIONS,
  MORE_COLORS,
  PRIMARY_COLORS,
} from "./constants";
import { getThemeCodeSnippet } from "./get-theme-code-snippet";

interface EditorPanelProps {
  editor: EmbeddingThemeEditorResult;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function EditorPanel({
  editor,
  onSave,
  onCancel,
  onDelete,
}: EditorPanelProps) {
  const [moreColorsOpen, setMoreColorsOpen] = useState(false);

  const { currentTheme } = editor;
  const themeCodeSnippet = useMemo(
    () => getThemeCodeSnippet(currentTheme?.settings ?? {}),
    [currentTheme?.settings],
  );

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
        <Flex align="center" justify="space-between" mb="xl">
          <Text fw={700} fz="xl">{t`Edit theme`}</Text>
          <CopyButton value={themeCodeSnippet}>
            {({ copied, copy }) => (
              <Button
                variant="subtle"
                size="compact-sm"
                leftSection={<Icon name="copy" size={16} />}
                onClick={copy}
              >
                {copied ? t`Copied!` : t`Copy code`}
              </Button>
            )}
          </CopyButton>
        </Flex>

        <Stack gap="lg">
          {/* Theme name */}
          <Card withBorder p="lg">
            <TextInput
              label={t`Theme name`}
              value={currentTheme.name}
              onChange={(e) => editor.setName(e.currentTarget.value)}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
            />
          </Card>

          {/* Main colors */}
          <Card withBorder p="lg">
            <Flex mb="sm" h="26" align="center" justify="space-between">
              <Text fw={600}>{t`Main colors`}</Text>
              {editor.hasMainColorChanges && (
                <Button
                  variant="subtle"
                  pt="5"
                  size="compact-sm"
                  aria-label={t`Revert to default main colors`}
                  onClick={editor.resetMainColors}
                >
                  <Icon name="revert" size={16} />
                </Button>
              )}
            </Flex>
            <Flex gap="sm">
              {PRIMARY_COLORS.map(({ key, label }) => (
                <ColorSwatchCard
                  key={key}
                  label={label()}
                  value={(colors[key] as string) ?? ""}
                  showAlpha
                  onChange={(color) => editor.setColor(key, color ?? "")}
                />
              ))}
            </Flex>

            <Flex mt="md" h="26" align="center" justify="space-between">
              <UnstyledButton onClick={() => setMoreColorsOpen((v) => !v)}>
                <Flex align="center" gap="xs">
                  <Text c="brand" fz="sm" fw={600}>
                    {moreColorsOpen
                      ? t`Show fewer colors`
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
                  aria-label={t`Revert to default additional colors`}
                  onClick={editor.resetAdditionalColors}
                >
                  <Icon name="revert" size={16} />
                </Button>
              )}
            </Flex>

            <Collapse in={moreColorsOpen}>
              <Box
                mt="sm"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "var(--mantine-spacing-sm)",
                }}
              >
                {MORE_COLORS.map(({ key, label }) => (
                  <ColorSwatchCard
                    key={key}
                    label={label()}
                    value={(colors[key] as string) ?? ""}
                    showAlpha
                    onChange={(color) => editor.setColor(key, color ?? "")}
                  />
                ))}
              </Box>

              <Text fw={600} fz="sm" mt="sm">{t`Chart colors`}</Text>
              <Box
                mt="sm"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "var(--mantine-spacing-sm)",
                }}
              >
                {Array.from({ length: CHART_COLOR_COUNT }, (_, i) => {
                  const chartColor = charts[i];
                  const value =
                    typeof chartColor === "object" && chartColor?.base
                      ? chartColor.base
                      : typeof chartColor === "string"
                        ? chartColor
                        : "";
                  return (
                    <ColorSwatchCard
                      key={i}
                      label={`Chart ${i + 1}`}
                      value={value}
                      showAlpha
                      onChange={(color) => editor.setChartColor(i, color ?? "")}
                    />
                  );
                })}
              </Box>
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
                placeholder={t`Default`}
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
                placeholder={t`Default`}
                rightSection={
                  <Text c="text-tertiary" fz="sm">
                    {"px"}
                  </Text>
                }
              />
            </Stack>
          </Card>
        </Stack>

        {onDelete && (
          <Button
            mt="lg"
            variant="subtle"
            color="error"
            px={0}
            leftSection={<Icon name="trash" size={16} />}
            onClick={onDelete}
          >
            {t`Delete theme`}
          </Button>
        )}
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
        <Button variant="filled" onClick={onSave} disabled={!editor.canSave}>
          {t`Save theme`}
        </Button>
      </Flex>
    </Flex>
  );
}
