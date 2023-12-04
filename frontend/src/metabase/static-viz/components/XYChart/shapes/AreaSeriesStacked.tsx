import { Group } from "@visx/group";
import type { PositionScale } from "@visx/shape/lib/types";
import { LineArea } from "metabase/static-viz/components/XYChart/shapes/LineArea";
import type {
  HydratedSeries,
  StackedDatumAccessor,
} from "metabase/static-viz/components/XYChart/types";
import { getY, getY1 } from "metabase/static-viz/components/XYChart/utils";

interface AreaSeriesProps {
  series: HydratedSeries[];
  yScale: PositionScale;
  xAccessor: StackedDatumAccessor;
}

export const AreaSeriesStacked = ({
  series: multipleSeries,
  yScale,
  xAccessor,
}: AreaSeriesProps) => {
  return (
    <Group>
      {multipleSeries.map(series => {
        return (
          <LineArea
            key={series.name}
            yScale={yScale}
            color={series.color}
            data={series.stackedData}
            x={xAccessor}
            y={datum => yScale(getY(datum)) ?? 0}
            y1={datum => yScale(getY1(datum)) ?? 0}
          />
        );
      })}
    </Group>
  );
};
