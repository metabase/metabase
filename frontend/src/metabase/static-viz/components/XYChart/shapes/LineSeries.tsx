import { Group } from "@visx/group";
import { LinePath } from "@visx/shape";
import type { PositionScale } from "@visx/shape/lib/types";
import { getY } from "metabase/static-viz/components/XYChart/utils";

import type {
  Series,
  SeriesDatum,
} from "metabase/static-viz/components/XYChart/types";

interface LineSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: (datum: SeriesDatum) => number;
}

export const LineSeries = ({
  series: multipleSeries,
  yScaleLeft,
  yScaleRight,
  xAccessor,
}: LineSeriesProps) => {
  return (
    <Group>
      {multipleSeries.map(series => {
        const yScale =
          series.yAxisPosition === "left" ? yScaleLeft : yScaleRight;
        if (!yScale) {
          return null;
        }

        const yAccessor = (datum: SeriesDatum) => yScale(getY(datum)) ?? 0;
        return (
          <LinePath
            key={series.name}
            data={series.data}
            x={xAccessor}
            y={yAccessor}
            stroke={series.color}
            strokeWidth={2}
          />
        );
      })}
    </Group>
  );
};
