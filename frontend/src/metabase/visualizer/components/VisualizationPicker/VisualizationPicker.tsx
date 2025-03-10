import { useMemo } from "react";
import _ from "underscore";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { useSelector } from "metabase/lib/redux";
import { Center, Flex, Icon, Menu, SegmentedControl, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import { getVisualizerRawSeries } from "metabase/visualizer/selectors";
import type { VisualizationDisplay } from "metabase-types/api";

import S from "./VisualizationPicker.module.css";

interface VisualizationPickerProps {
  value: VisualizationDisplay | null;
  onChange: (vizType: string) => void;
}
export function VisualizationPicker({
  value,
  onChange,
}: VisualizationPickerProps) {
  const series = useSelector(getVisualizerRawSeries);

  const vizOptions = useMemo(() => {
    const [mainSeries] = series ?? [];
    const { data } = mainSeries ?? {};
    return Array.from(visualizations)
      .filter(([, viz]) => !viz.hidden && viz.supportsVisualizer)
      .map(([vizType, viz]) => {
        return {
          label: viz.uiName,
          value: vizType,
          icon: viz.iconName,
          isSensible: Boolean(data && viz.isSensible?.(data)),
        };
      });
  }, [series]);

  const [sensibleOptions, nonsensibleOptions] = useMemo(
    () => _.partition(vizOptions, option => option.isSensible),
    [vizOptions],
  );

  const selectedOption = useMemo(
    () => vizOptions.find(option => option.value === value),
    [value, vizOptions],
  );

  return (
    <>
      <SegmentedControl
        value={selectedOption?.value}
        data={sensibleOptions.map((o, i) => ({
          value: o.value,
          label: (
            <Center key={i} onClick={() => onChange(o.value)}>
              <Icon name={o.icon} />
            </Center>
          ),
        }))}
      />
      {nonsensibleOptions.length > 0 && (
        <Menu>
          <Menu.Target>
            <IconButtonWrapper style={{ marginLeft: "4px" }}>
              <Icon name="ellipsis" />
              <Icon name="chevrondown" size={8} />
            </IconButtonWrapper>
          </Menu.Target>
          <Menu.Dropdown>
            {nonsensibleOptions.map(({ label, value, icon }) => (
              <Menu.Item
                key={value}
                className={S.ListItem}
                aria-selected={value === selectedOption?.value}
                onClick={() => onChange(value)}
              >
                <Flex align="center">
                  <Icon name={icon} />
                  <Text className={S.ListItemLabel} ml="sm">
                    {label}
                  </Text>
                </Flex>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </>
  );
}
