import { t } from "ttag";

import { Card, Center, Text } from "metabase/ui";
import type { BaseCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { useAreAllDataPointsOutOfRange } from "metabase/visualizations/visualizations/CartesianChart/use-data-points-visible";
import type { VisualizationSettings } from "metabase-types/api";

export interface DataPointsVisiblePopoverProps {
  isDashboard: boolean;
  isVisualizer: boolean;
  chartModel: BaseCartesianChartModel;
  settings: VisualizationSettings;
}

export const DataPointsVisiblePopover = ({
  isDashboard,
  isVisualizer,
  chartModel,
  settings,
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
      {/* Adjust position of the card so that it is centered in the dashcard. we need to account for height of card title */}
      {isDashboard ? (
        <Card
          withBorder
          py="sm"
          maw="9rem"
          pos="relative"
          top={-10}
          shadow="none"
        >
          <Text ta="center">{t`Every data point is out of range`}</Text>
        </Card>
      ) : (
        <Card withBorder py="sm" shadow="none">
          <Text>{t`Every data point is off-screen because of your y-axis settings`}</Text>
        </Card>
      )}
    </Center>
  );
};
