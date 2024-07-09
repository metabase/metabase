/* eslint-disable */
/* Use ActionIcon */
import { t } from "ttag";

import { Menu, Flex, Card, Title, Icon, IconName, Text } from "metabase/ui";
import type { Series, SingleSeries } from "metabase-types/api";
import { ActionIcon } from "@mantine/core";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import visualizations from "metabase/visualizations";

interface VisualizerUsedProps {
  series: Series;
  onFocusSeries: (index: number) => void;
  onVizTypeChange: (index: number, vizType: string) => void;
  onRefreshData: (index: number) => void;
  onRemoveSeries: (index: number) => void;
}

export function VisualizerUsed({
  series,
  onFocusSeries,
  onVizTypeChange,
  onRefreshData,
  onRemoveSeries,
}: VisualizerUsedProps) {
  return (
    <Card h="100%">
      <Title order={4}>{t`Being used`}</Title>
      {series.map(({ card, data }, index) => {
        return (
          <Flex key={index} py="sm" align="center">
            {/* TODO - create a dark variant  */}
            <VisualizationPicker
              series={{ card, data }}
              onChange={vizType => onVizTypeChange(index, vizType)}
            />
            <Text truncate title={card.name}>
              {card.name}
            </Text>
            <Flex ml="auto">
              <ActionIcon onClick={() => onFocusSeries(index)}>
                <Icon
                  name={
                    card.dataset_query.type === "native" ? "sql" : "notebook"
                  }
                />
              </ActionIcon>
              <Menu>
                <Menu.Target>
                  <ActionIcon>
                    <Icon name="ellipsis" />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    onClick={() => onRefreshData(index)}
                  >{t`Refresh`}</Menu.Item>
                  <Menu.Item
                    onClick={() => onRemoveSeries(index)}
                  >{t`Remove`}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Flex>
          </Flex>
        );
      })}
    </Card>
  );
}

interface VisualizationPickerProps {
  series: SingleSeries;
  onChange: (vizType: string) => void;
}

function VisualizationPicker({ series, onChange }: VisualizationPickerProps) {
  const { card, data } = series;

  const vizOptions = Array.from(visualizations)
    .filter(([, viz]) => {
      if (viz.hidden) {
        return false;
      }
      if (typeof viz.isSensible === "function") {
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
          <Icon name={card.display as IconName} />
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
