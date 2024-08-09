import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";

import type { BaseCartesianChartModel } from "../cartesian/model/types";

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
