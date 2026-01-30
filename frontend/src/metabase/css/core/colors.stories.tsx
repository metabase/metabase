import { useState } from "react";

import { ColorPicker } from "metabase/common/components/ColorPicker";
import { ColorPill } from "metabase/common/components/ColorPill";
import { suggestColors } from "metabase/lib/colors/derives/derive-theme";
import { Box, Card, Flex, Group, Stack, Text } from "metabase/ui";

export default {
  title: "Design System/Colors",
};

const COLOR_NAMES = [
  // colors.module.css
  "--mb-color-brand",
  "--mb-color-brand-light",
  "--mb-color-brand-lighter",
  "--mb-color-success",
  "--mb-color-summarize",
  "--mb-color-error",
  "--mb-color-danger",
  "--mb-color-text-primary",
  "--mb-color-text-secondary",
  "--mb-color-text-tertiary",
  "--mb-color-background-primary-inverse",
  "--mb-color-background-tertiary-inverse",
  "--mb-color-background-tertiary",
  "--mb-color-background-secondary",
  "--mb-color-background-primary",
  "--mb-color-background-error",
  "--mb-color-background-error",
  "--mb-color-shadow",
  "--mb-color-border",
  "--mb-color-filter",
  "--mb-color-focus",
  "--mb-color-warning",
  "--mb-color-text-primary",
  "--mb-color-text-secondary",
  "--mb-color-text-secondary-inverse",
  "--mb-color-text-tertiary",
  "--mb-color-text-selected",
  "--mb-color-text-brand",
  "--mb-color-text-primary-inverse",
  "--mb-color-background-primary",
  "--mb-color-background-selected",
  "--mb-color-background-disabled",
  "--mb-color-background-primary-inverse",
  // other colors from css-variables.ts
  "--mb-color-brand-alpha-04",
  "--mb-color-brand-alpha-88",
  "--mb-color-border",
  "--mb-color-text-primary-inverse",
  "--mb-color-overlay",
  "--mb-color-background-primary-alpha-15",
];

export function Default() {
  return (
    <Flex gap="md" wrap="wrap">
      {COLOR_NAMES.map((colorName) => {
        return (
          <Card
            // @ts-expect-error story file
            bg={`var(${colorName})`}
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

export function ColorHarmony() {
  const [brand, setBrand] = useState("#509EE2");

  const suggestions = suggestColors(brand);

  return (
    <Box p="md">
      <Group mb="lg" gap="lg">
        {Object.keys(suggestions).map((name) => (
          <Stack key={name} gap="xs" align="center">
            <ColorPill color={suggestions[name]} />
            <Text>{name}</Text>
          </Stack>
        ))}
      </Group>
      <ColorPicker value={brand} onChange={(val) => val && setBrand(val)} />
      <Text>Brand</Text>
    </Box>
  );
}
