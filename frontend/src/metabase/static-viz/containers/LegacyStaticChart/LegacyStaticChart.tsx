import type { ColorPalette } from "metabase/lib/colors/types";
import Funnel from "metabase/static-viz/components/FunnelChart";
import Gauge from "metabase/static-viz/components/Gauge";
import ProgressBar from "metabase/static-viz/components/ProgressBar";
import { createColorGetter } from "metabase/static-viz/lib/colors";

export type LegacyStaticChartType =
  | "progress"
  | "waterfall"
  | "gauge"
  | "funnel";

export interface LegacyStaticChartProps {
  type: LegacyStaticChartType;
  options: any;
  colors?: ColorPalette;
  hasDevWatermark?: boolean;
}

/**
 * @deprecated use StaticChart instead
 */
export const LegacyStaticChart = ({
  type,
  options,
}: LegacyStaticChartProps) => {
  const getColor = createColorGetter(options.colors);
  const hasDevWatermark = Boolean(options.tokenFeatures?.development_mode);
  const chartProps = { ...options, getColor, hasDevWatermark };

  switch (type) {
    case "gauge":
      return <Gauge {...chartProps} />;
    case "progress":
      return <ProgressBar {...chartProps} />;
    case "funnel":
      return <Funnel {...chartProps} />;
  }
};
