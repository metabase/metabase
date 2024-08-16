import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import TooltipStyles from "metabase/visualizations/components/ChartTooltip/EChartsTooltip/EChartsTooltip.module.css";

import type { BaseCartesianChartModel } from "../cartesian/model/types";
import type { PieChartModel } from "../pie/model/types";

export const TOOLTIP_BASE_OPTION = {
  confine: true,
  appendTo: () => {
    let container = document.querySelector(
      ".echarts-tooltip-container",
    ) as HTMLDivElement;
    if (!container) {
      container = document.createElement("div");
      container.classList.add("echarts-tooltip-container");
      container.style.setProperty("overflow", "hidden");
      container.style.setProperty("height", "100%");
      container.style.setProperty("position", "relative");
      container.style.setProperty("pointer-events", "none");

      document.body.append(container);
    }

    return container;
  },
  className: TooltipStyles.ChartTooltipRoot,
};

export const getMarkerColorClass = (hexColor: string) => {
  return `marker-${hexColor.slice(1, 7)}`;
};

export const useInjectSeriesColorsClasses = (hexColors: string[]) => {
  const cssString = useMemo(() => {
    if (hexColors.length === 0) {
      return null;
    }

    return hexColors
      .map(color => {
        const cssClassName = getMarkerColorClass(color);
        return `
    .${cssClassName} {
      background-color: ${color};
    }`;
      })
      .join("\n");
  }, [hexColors]);

  const style = useMemo(
    () =>
      cssString !== null ? (
        <style nonce={window.MetabaseNonce}>{cssString}</style>
      ) : null,
    [cssString],
  );

  return style;
};

export const useCartesianChartSeriesColorsClasses = (
  chartModel: BaseCartesianChartModel,
) => {
  const hexColors = useMemo(
    () =>
      chartModel.seriesModels
        .map(seriesModel => seriesModel.color)
        .filter(isNotNull),
    [chartModel],
  );

  return useInjectSeriesColorsClasses(hexColors);
};

export const usePieChartValuesColorsClasses = (chartModel: PieChartModel) => {
  const hexColors = useMemo(() => {
    return chartModel.slices.map(slice => slice.data.color);
  }, [chartModel.slices]);

  return useInjectSeriesColorsClasses(hexColors);
};
