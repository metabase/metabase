import { ColorPickerContent } from "metabase/common/components/ColorPicker/ColorPickerContent";
import { Box, Card, Flex, Popover, Text } from "metabase/ui";

interface ColorSwatchCardProps {
  label: string;
  value: string;
  onChange: (color?: string) => void;
}

export function ColorSwatchCard({
  label,
  value,
  onChange,
}: ColorSwatchCardProps) {
  return (
    <Popover position="bottom" shadow="md">
      <Popover.Target>
        <Card withBorder p="sm" style={{ cursor: "pointer", flex: 1 }}>
          <Flex
            h={48}
            direction="column"
            align="center"
            justify="space-evenly"
            pt={2}
          >
            <Box
              w={20}
              h={20}
              style={{
                borderRadius: "50%",
                backgroundColor: value || "transparent",
                border: "1px solid var(--mb-color-border)",
              }}
            />
            <Text fz={10}>{label}</Text>
          </Flex>
        </Card>
      </Popover.Target>
      <Popover.Dropdown>
        <ColorPickerContent value={value} onChange={onChange} />
      </Popover.Dropdown>
    </Popover>
  );
}
