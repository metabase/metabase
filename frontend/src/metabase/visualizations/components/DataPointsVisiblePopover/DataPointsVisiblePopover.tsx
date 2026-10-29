import type { EChartsType } from "echarts/core";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { Card, Center, Text } from "metabase/ui";
import {
  DATA_VISIBILITY_ACTION,
  DATA_VISIBILITY_EVENT,
  isDataVisibilityResult,
} from "metabase/viz-core";

export interface DataPointsVisiblePopoverProps {
  isDashboard: boolean;
  isVisualizer: boolean;
  chartInstance: EChartsType | undefined;
}

const useRenderedDataVisibility = (chartInstance: EChartsType | undefined) => {
  const [anythingRendered, setAnythingRendered] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (!chartInstance) {
      return;
    }

    const handleResult = (event: unknown) => {
      if (isDataVisibilityResult(event)) {
        setAnythingRendered(event.anythingRendered);
      }
    };

    const requestResult = () => {
      if (!chartInstance.isDisposed()) {
        chartInstance.dispatchAction({ type: DATA_VISIBILITY_ACTION });
      }
    };

    chartInstance.on(DATA_VISIBILITY_EVENT, handleResult);
    chartInstance.on("rendered", requestResult);

    requestResult();

    return () => {
      chartInstance.off(DATA_VISIBILITY_EVENT, handleResult);
      chartInstance.off("rendered", requestResult);
    };
  }, [chartInstance]);

  return anythingRendered;
};

export const DataPointsVisiblePopover = ({
  isDashboard,
  isVisualizer,
  chartInstance,
}: DataPointsVisiblePopoverProps) => {
  const anythingRendered = useRenderedDataVisibility(chartInstance);
  const allPointsHidden = anythingRendered === false;

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
