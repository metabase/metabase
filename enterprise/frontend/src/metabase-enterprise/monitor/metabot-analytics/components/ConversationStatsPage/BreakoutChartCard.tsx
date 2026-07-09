import cx from "classnames";

import { Card, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { ClickActionsMode } from "metabase/visualizations/types";
import type { VisualizationDisplay } from "metabase-types/api";

import S from "./ChartCard.module.css";
import type { DimensionClickHandler } from "./types";

// needed for visualizationIsClickable to return true when a custom handler is
// attached; handleVisualizationClick short-circuits before this action runs
const CLICKABLE_MODE: ClickActionsMode = {
  actionsForClick: () => [{ name: "custom-click" } as any],
};

type Props = {
  title: string;
  rawSeries: any[] | null;
  isFetching: boolean;
  display: VisualizationDisplay;
  h: number;
  otherLabel: string;
  onDimensionClick?: DimensionClickHandler;
};

export function BreakoutChartCard({
  title,
  rawSeries,
  isFetching,
  display,
  h,
  otherLabel,
  onDimensionClick,
}: Props) {
  if (isFetching || !rawSeries) {
    return <Skeleton h={h} />;
  }

  return (
    <Card
      className={cx(S.visualization, {
        [S.nonClickable]: !onDimensionClick,
      })}
      withBorder
      shadow="none"
      px="lg"
      pt="md"
      pb={display === "row" ? "md" : "0"}
      h={h}
    >
      <Text fw="bold" mb="md">
        {title}
      </Text>
      <Visualization
        rawSeries={rawSeries}
        isDashboard
        mode={onDimensionClick ? CLICKABLE_MODE : undefined}
        handleVisualizationClick={(clicked: any) => {
          const value = clicked?.dimensions?.[0]?.value;
          if (value != null && value !== otherLabel && onDimensionClick) {
            onDimensionClick(String(value));
          }
        }}
      />
    </Card>
  );
}
