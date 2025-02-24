import { Card, Flex, Text } from "metabase/ui";

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
  "--mb-color-text-dark",
  "--mb-color-text-medium",
  "--mb-color-text-light",
  "--mb-color-bg-black",
  "--mb-color-bg-dark",
  "--mb-color-bg-medium",
  "--mb-color-bg-light",
  "--mb-color-bg-white",
  "--mb-color-bg-error",
  "--mb-color-bg-night",
  "--mb-color-shadow",
  "--mb-color-border",
  "--mb-color-filter",
  "--mb-color-focus",
  "--mb-color-warning",
  "--mb-color-text-primary",
  "--mb-color-text-secondary",
  "--mb-color-text-tertiary",
  "--mb-color-text-selected",
  "--mb-color-text-brand",
  "--mb-color-text-white",
  "--mb-color-background",
  "--mb-color-background-selected",
  "--mb-color-background-disabled",
  "--mb-color-background-inverse",
  "--mb-color-background-brand",
  // other colors from css-variables.ts
  "--mb-color-brand-alpha-04",
  "--mb-color-brand-alpha-88",
  "--mb-color-border-alpha-30",
  "--mb-color-text-white-alpha-85",
  "--mb-color-bg-black-alpha-60",
  "--mb-color-bg-white-alpha-15",
];

export function Default() {
  return (
    <Flex gap="md" wrap="wrap">
      {COLOR_NAMES.map(colorName => {
        return (
          <Card
            bg={`var(${colorName})`}
            key={colorName}
            withBorder
            style={{
              flexBasis: "24%",
            }}
          >
            <Text color="black">{colorName}</Text>
          </Card>
        );
      })}
    </Flex>
  );
}
