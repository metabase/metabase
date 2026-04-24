import { ColorPicker } from "metabase/common/components/ColorPicker";
import { Flex, Text } from "metabase/ui";

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (color?: string) => void;
}

export function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <Flex align="center" justify="space-between">
      <Text fz="sm">{label}</Text>
      <ColorPicker value={value} onChange={onChange} />
    </Flex>
  );
}
