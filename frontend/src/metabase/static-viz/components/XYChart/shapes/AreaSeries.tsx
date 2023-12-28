import { Group } from "@visx/group";
import type { PositionScale } from "@visx/shape/lib/types";
import { LineArea } from "metabase/static-viz/components/XYChart/shapes/LineArea";
import { getY } from "metabase/static-viz/components/XYChart/utils";
import type {
  Series,
  SeriesDatum,
  DatumAccessor,
  StackedDatumAccessor,
} from "metabase/static-viz/components/XYChart/types";
import { AreaSeriesStacked } from "./AreaSeriesStacked";

interface AreaSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: DatumAccessor;
  areStacked?: boolean;
}

export const AreaSeries = ({
  series: multipleSeries,
  yScaleLeft,
  yScaleRight,
  xAccessor,
  areStacked,
}: AreaSeriesProps) => {
  if (areStacked) {
    return (
      <AreaSeriesStacked
        series={multipleSeries}
        // Stacked charts work only for a single dataset with one dimension and left Y-axis
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        yScale={yScaleLeft!}
        xAccessor={xAccessor as unknown as StackedDatumAccessor}
      />
    );
  }

  return (
    <Group>
      {multipleSeries.map(series => {
        const yScale =
          series.yAxisPosition === "left" ? yScaleLeft : yScaleRight;

        if (!yScale) {
          return null;
        }

        const yAccessor = (d: SeriesDatum) => yScale(getY(d)) ?? 0;
        return (
          <LineArea
            key={series.name}
            yScale={yScale}
            color={series.color}
            data={series.data}
            x={xAccessor as DatumAccessor}
            y={yAccessor}
            y1={yScale(0) ?? 0}
          />
        );
      })}
    </Group>
  );
};
