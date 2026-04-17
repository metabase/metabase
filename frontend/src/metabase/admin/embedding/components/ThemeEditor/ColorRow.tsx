import { ColorPicker } from "metabase/common/components/ColorPicker";
import { Box, Flex, Text } from "metabase/ui";

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (color?: string) => void;
}

export function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <Flex align="center" gap="sm">
      <Text fz="sm" flex={1}>
        {label}
      </Text>
      <Box w={160}>
        <ColorPicker value={value} onChange={onChange} />
      </Box>
    </Flex>
  );
}
