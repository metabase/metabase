import Funnel from "metabase/static-viz/components/FunnelChart";
import Gauge from "metabase/static-viz/components/Gauge";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import type { ColorSettings } from "metabase-types/api/settings";

export type LegacyStaticChartType = "gauge" | "funnel";

export interface LegacyStaticChartProps {
  type: LegacyStaticChartType;
  options: any;
  colors?: ColorSettings;
  hasDevWatermark?: boolean;
}

/**
 * @deprecated use RenderChart instead
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
    case "funnel":
      return <Funnel {...chartProps} />;
  }
};
