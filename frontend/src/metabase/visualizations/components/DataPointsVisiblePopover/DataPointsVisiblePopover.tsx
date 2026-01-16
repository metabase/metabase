import { jt, t } from "ttag";

import {
  Button,
  Card,
  Center,
  Group,
  HoverCard,
  Stack,
  Text,
} from "metabase/ui";
import type {
  CartesianChartModel,
  ScatterPlotModel,
  WaterfallChartModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { useAreAllDataPointsOutOfRange } from "metabase/visualizations/visualizations/CartesianChart/use-data-points-visible";
import type { VisualizationSettings } from "metabase-types/api";

interface Props {
  isDashboard: boolean;
  isVisualizer: boolean;
  chartModel: CartesianChartModel | ScatterPlotModel | WaterfallChartModel;
  settings: VisualizationSettings;
  autoChange: () => void;
  openSettings: () => void;
}

export const DataPointsVisiblePopover = ({
  isDashboard,
  isVisualizer,
  chartModel,
  settings,
  autoChange,
  openSettings,
}: Props) => {
  const allPointsHidden = useAreAllDataPointsOutOfRange(chartModel, settings);

  if (!allPointsHidden || isVisualizer) {
    return null;
  }

  return (
    <Center
      pos="absolute"
      right={0}
      left={0}
      py="xl"
      top={isDashboard ? 0 : undefined}
      bottom={isDashboard ? 0 : undefined}
    >
      {isDashboard ? (
        <HoverCard>
          <HoverCard.Target>
            <Card withBorder py="sm" maw="9rem">
              <Text ta="center">{t`Every data point is out of range`}</Text>
            </Card>
          </HoverCard.Target>
          <HoverCard.Dropdown p="sm" w="18rem">
            <Text>{jt`This is because of your y-axis settings. You can change this chart to ${(<Text key="auto-y-axis" onClick={autoChange} c="brand" component="button">{t`use an auto y-axis`}</Text>)}, or ${(<Text key="open-settings" onClick={openSettings} c="brand" component="button">{t`open the axis settings.`}</Text>)}`}</Text>
          </HoverCard.Dropdown>
        </HoverCard>
      ) : (
        <Card withBorder py="sm">
          <Stack gap="xs">
            <Text>{t`Every data point is off-screen because of your y-axis settings`}</Text>
            <Group justify="center" gap="lg">
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={autoChange}
              >{t`Change to auto y-axis`}</Button>
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={openSettings}
              >{t`Open axis settings`}</Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Center>
  );
};
