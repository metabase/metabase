/* eslint-disable metabase/no-color-literals -- storybook demo */
import { Box, Stack, Text } from "metabase/ui";

interface SwatchProps {
  label: string;
  hex: string;
  size?: number;
}

/**
 * A small color swatch with its label and hex value. Used in the resolved
 * palette section under the harmony wheel.
 */
export function Swatch({ label, hex, size = 32 }: SwatchProps) {
  return (
    <Stack gap={4} align="center">
      <Box
        w={size}
        h={size}
        style={{
          background: hex,
          borderRadius: size / 2,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      />
      <Text size="xs" fw={500}>
        {label}
      </Text>
      <Text size="xs" c="text-secondary" ff="monospace">
        {hex}
      </Text>
    </Stack>
  );
}
