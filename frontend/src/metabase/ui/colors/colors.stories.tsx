import { useState } from "react";

import { Box, Card, Flex, Group, Stack, Text } from "metabase/ui";

import { colors } from "./colors";
import { suggestHarmonyColors } from "./harmonies";

export default {
  title: "Design System/Colors",
};

const COLOR_NAMES = Object.keys(colors);

export function Default() {
  return (
    <Flex gap="md" wrap="wrap" pb="lg">
      {COLOR_NAMES.map((colorName) => {
        return (
          <Card
            // @ts-expect-error story file
            bg={`var(--mb-color-${colorName})`}
            key={colorName}
            withBorder
            style={{
              flexBasis: "24%",
            }}
          >
            {/* @ts-expect-error story file */}
            <Text c="black">{colorName}</Text>
          </Card>
        );
      })}
    </Flex>
  );
}

const ACCESSORY_LABELS: {
  key: "filter" | "summarize" | "positive" | "negative";
  label: string;
}[] = [
  { key: "filter", label: "Filter" },
  { key: "summarize", label: "Summarize" },
  { key: "positive", label: "Positive" },
  { key: "negative", label: "Negative" },
];

const Swatch = ({ color }: { color: string }) => (
  <Box
    w={32}
    h={32}
    style={{ background: color, borderRadius: 16, border: "1px solid #ddd" }}
  />
);

export function ColorHarmony() {
  const [brand, setBrand] = useState("#509EE2");
  const harmony = suggestHarmonyColors(brand);

  return (
    <Box p="md">
      <Stack gap="lg">
        <Stack gap="xs">
          <Text fw={600}>{"Brand"}</Text>
          <Group gap="sm" align="center">
            <input
              type="color"
              value={brand}
              onChange={(e) => setBrand(e.currentTarget.value)}
            />
            <Text size="sm" c="text-secondary">
              {brand}
            </Text>
          </Group>
        </Stack>

        <Stack gap="xs">
          <Text fw={600}>{"Accessory colors"}</Text>
          <Group gap="lg">
            {ACCESSORY_LABELS.map(({ key, label }) => (
              <Stack key={key} gap="xs" align="center">
                <Swatch color={harmony[key]} />
                <Text size="sm">{label}</Text>
                <Text size="xs" c="text-secondary">
                  {harmony[key]}
                </Text>
              </Stack>
            ))}
          </Group>
        </Stack>

        <Stack gap="xs">
          <Text fw={600}>{"Chart colors"}</Text>
          <Group gap="lg">
            {harmony.charts.map((chart, i) => (
              <Stack key={i} gap="xs" align="center">
                <Swatch color={chart} />
                <Text size="sm">{`Chart ${i + 1}`}</Text>
                <Text size="xs" c="text-secondary">
                  {chart}
                </Text>
              </Stack>
            ))}
          </Group>
        </Stack>
      </Stack>
    </Box>
  );
}
