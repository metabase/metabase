import { jt, t } from "ttag";

import {
  Anchor,
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

import S from "./DataPointsVisiblePopover.module.css";

export interface DataPointsVisiblePopoverProps {
  isDashboard: boolean;
  isVisualizer: boolean;
  chartModel: CartesianChartModel | ScatterPlotModel | WaterfallChartModel;
  settings: VisualizationSettings;
  autoChange: () => void;
  openSettings: () => void;
  canWrite?: boolean;
}

export const DataPointsVisiblePopover = ({
  isDashboard,
  isVisualizer,
  chartModel,
  settings,
  autoChange,
  openSettings,
  canWrite,
}: DataPointsVisiblePopoverProps) => {
  const allPointsHidden = useAreAllDataPointsOutOfRange(chartModel, settings);

  if (!allPointsHidden || isVisualizer) {
    return null;
  }

  return (
    <Center
      pos="absolute"
      right={0}
      left={0}
      top={0}
      bottom={isDashboard ? 0 : undefined}
      role="dialog"
      aria-label={t`data points are off screen`}
    >
      {isDashboard ? (
        <HoverCard disabled={canWrite === false}>
          <HoverCard.Target>
            {/* Adjust position of the card so that it is centered in the dashcard. we need to account for height of card title */}
            <Card withBorder py="sm" maw="9rem" pos="relative" top={-10}>
              <Text ta="center">{t`Every data point is out of range`}</Text>
            </Card>
          </HoverCard.Target>
          <HoverCard.Dropdown p="sm" w="18rem">
            <Text>{jt`This is because of your y-axis settings. You can change this chart to ${(
              <Anchor
                key="auto-y-axis"
                onClick={autoChange}
                component="button"
              >{t`use an auto y-axis`}</Anchor>
            )}, or ${(
              <Anchor
                key="open-settings"
                onClick={openSettings}
                component="button"
              >{t`open the axis settings.`}</Anchor>
            )}`}</Text>
          </HoverCard.Dropdown>
        </HoverCard>
      ) : (
        <Card withBorder py="sm">
          <Stack gap="xs">
            <Text>{t`Every data point is off-screen because of your y-axis settings`}</Text>
            <Group justify="center" gap="lg" className={S.ButtonsGroup}>
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
