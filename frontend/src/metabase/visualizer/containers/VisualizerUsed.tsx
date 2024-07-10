// eslint-disable-next-line no-restricted-imports
import { ActionIcon } from "@mantine/core";
import { t } from "ttag";

import {
  Menu,
  Flex,
  Card,
  Title,
  Icon,
  type IconName,
  Text,
} from "metabase/ui";
import type { Series } from "metabase-types/api";

import { VizTypePicker } from "../components/VizTypePicker";

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
            <VizTypePicker
              value={card.display as IconName}
              data={data}
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
