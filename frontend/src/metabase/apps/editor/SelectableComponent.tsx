import { Box, Group, Paper, Text } from "metabase/ui";

import type { ComponentMetadata } from "../const/systemComponents";

type Props = {
  component: ComponentMetadata;
  onClick: (component: ComponentMetadata) => void;
};

export function SelectableComponent({ component, onClick }: Props) {
  return (
    <Paper
      p="md"
      radius="xs"
      withBorder
      shadow="none"
      style={{ cursor: "pointer" }}
      onClick={() => onClick(component)}
    >
      <Group>
        <component.icon size={16} />
        <Box>
          <Text fw="bold" lh={1.2}>
            {component.name}
          </Text>
          <Text fz="sm" c="text-secondary" lh={1.2}>
            {component.description}
          </Text>
        </Box>
      </Group>
    </Paper>
  );
}
