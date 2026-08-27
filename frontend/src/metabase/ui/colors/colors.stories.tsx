import { Card, Flex, Text } from "metabase/ui";

import { ColorHarmonyDemo } from "./ColorHarmonyStory/ColorHarmonyDemo";
import { colors } from "./colors";

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

export function ColorHarmony() {
  return <ColorHarmonyDemo />;
}
// Interactive demo: HSL sliders + draggable hue ring make the rendered output
// non-deterministic across snapshots, so skip Loki.
ColorHarmony.parameters = { loki: { skip: true } };
