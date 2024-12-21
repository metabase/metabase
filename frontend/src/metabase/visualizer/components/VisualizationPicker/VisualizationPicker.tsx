import { useMemo } from "react";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Flex, Icon, type IconName, Menu, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { DatasetData, VisualizationDisplay } from "metabase-types/api";

interface VisualizationPickerProps {
  value: VisualizationDisplay | null;
  data?: DatasetData;
  onChange: (vizType: string) => void;
}

export function VisualizationPicker({
  value,
  data,
  onChange,
}: VisualizationPickerProps) {
  const vizOptions = useMemo(() => {
    return Array.from(visualizations)
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
  }, [data]);

  return (
    <Menu>
      <Menu.Target>
        <IconButtonWrapper style={{ marginRight: "4px" }}>
          <Icon name={(value ?? "area") as IconName} />
          <Icon name="chevrondown" size={8} />
        </IconButtonWrapper>
      </Menu.Target>
      <Menu.Dropdown>
        {vizOptions.map(({ label, value, icon }) => (
          <Menu.Item key={value} onClick={() => onChange(value)}>
            <Flex align="center">
              <Icon name={icon} />
              <Text ml="sm">{label}</Text>
            </Flex>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
