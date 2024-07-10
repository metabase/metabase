// eslint-disable-next-line no-restricted-imports
import { ActionIcon } from "@mantine/core";

import { Menu, Flex, Icon, type IconName, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { DatasetData } from "metabase-types/api";

interface VizTypePickerProps {
  value: IconName;
  data?: DatasetData;
  onChange: (vizType: string) => void;
}

export function VizTypePicker({ value, data, onChange }: VizTypePickerProps) {
  const vizOptions = Array.from(visualizations)
    .filter(([, viz]) => {
      if (viz.hidden) {
        return false;
      }
      if (data && typeof viz.isSensible === "function") {
        return viz.isSensible(data);
      }
      return true;
    })
    .map(([vizType, viz]) => ({
      label: viz.uiName,
      value: vizType,
      icon: viz.iconName,
    }));
  return (
    <Menu>
      <Menu.Target>
        <ActionIcon mr="sm">
          <Icon name={value} />
          <Icon name="chevrondown" size={8} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown bg="black.0">
        {vizOptions.map(({ label, value, icon }) => (
          <Menu.Item key={value} onClick={() => onChange(value)}>
            <Flex align="center" color="white">
              <Icon name={icon} />
              <Text ml="sm">{label}</Text>
            </Flex>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
