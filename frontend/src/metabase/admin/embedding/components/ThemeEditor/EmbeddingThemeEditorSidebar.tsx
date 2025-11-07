import { useState } from "react";
import { t } from "ttag";

import { ColorPillPicker } from "metabase/common/components/ColorPicker";
import { useSetting } from "metabase/common/hooks";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { originalColors } from "metabase/lib/colors";
import {
  ActionIcon,
  Anchor,
  Box,
  Card,
  Flex,
  Group,
  Icon,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "metabase/ui";

import { FONT_OPTIONS } from "../../constants/fonts";

import { useEmbeddingThemeEditor } from "./context";
import { getMainThemeColors } from "./utils/theme-colors";

const defaultMetabaseColors = {
  ...originalColors,
};

export const EmbeddingThemeEditorSidebar = () => {
  const { name, theme, setName, setColor, setThemeValue, resetColors } =
    useEmbeddingThemeEditor();
  const applicationColors = useSetting("application-colors");

  // Undebounced color values to keep color selection fast.
  const [colorPreviewValues, setColorPreviewValues] = useState<
    Record<string, string>
  >({});

  // Check if any colors have been changed
  const hasColorChanged = !!theme?.colors;

  return (
    <Stack gap="lg" py="md">
      <Title order={2}>{t`Edit theme`}</Title>

      {/* Theme name card */}
      <Card withBorder p="md">
        <Stack gap="xs">
          <Text fw="bold" c="text-medium">
            {t`Theme name`}
          </Text>

          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="md"
          />
        </Stack>
      </Card>

      {/* Main colors card */}
      <Card withBorder p="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw="bold" c="text-medium">
              {t`Main colors`}
            </Text>

            {hasColorChanged && (
              <Tooltip label={t`Reset colors`}>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={resetColors}
                  aria-label={t`Reset colors`}
                >
                  <Icon name="revert" c="brand" />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.5rem",
            }}
          >
            {getMainThemeColors().map(({ key, name, originalColorKey }) => {
              // Use the default from appearance settings. If not set, use the default Metabase color.
              const originalColor =
                applicationColors?.[originalColorKey] ??
                defaultMetabaseColors[originalColorKey];

              const previewValue =
                colorPreviewValues[key] ?? theme?.colors?.[key];

              return (
                <Card
                  key={key}
                  px={0}
                  py="sm"
                  withBorder
                  style={{ cursor: "pointer", height: "100%" }}
                >
                  <Stack gap="xs" align="center" h="100%" justify="center">
                    <ColorPillPicker
                      onChange={(color) => {
                        if (color) {
                          setColor(key as keyof MetabaseColors, color);
                        }
                      }}
                      originalColor={originalColor}
                      previewValue={previewValue}
                      onPreviewChange={(color: string) =>
                        setColorPreviewValues((prev) => ({
                          ...prev,
                          [key]: color,
                        }))
                      }
                      pillProps={{ isSelected: false }}
                      data-testid={`${key}-color-picker`}
                    />
                    <Text size="sm" fw={500} ta="center">
                      {name}
                    </Text>
                  </Stack>
                </Card>
              );
            })}
          </Box>

          <Anchor size="sm" c="brand">
            {t`Show more colors`} <Icon name="chevronright" size={12} />
          </Anchor>
        </Stack>
      </Card>

      {/* Font card */}
      <Card withBorder p="md">
        <Stack gap="xs">
          <Text fw="bold" c="text-medium">
            {t`Font`}
          </Text>

          <Select
            value={theme.fontFamily ?? "Lato"}
            onChange={(value) => setThemeValue("fontFamily", value ?? "Lato")}
            data={FONT_OPTIONS}
            size="md"
          />

          <Text fw="bold" c="text-medium" mt="sm">
            {t`Base font size`}
          </Text>

          <Flex gap="xs" align="center">
            <NumberInput
              value={parseInt(theme.fontSize ?? "16", 10)}
              onChange={(value) => setThemeValue("fontSize", `${value}px`)}
              min={8}
              max={32}
              step={1}
              size="md"
              style={{ flex: 1 }}
            />
            <Text size="sm" c="text-medium">
              px
            </Text>
          </Flex>

          <Text fw="bold" c="text-medium" mt="sm">
            {t`Line height`}
          </Text>

          <NumberInput
            value={parseFloat(theme.lineHeight?.toString() ?? "1.5")}
            onChange={(value) => setThemeValue("lineHeight", value)}
            min={1}
            max={3}
            step={0.1}
            decimalScale={1}
            size="md"
          />
        </Stack>
      </Card>
    </Stack>
  );
};
