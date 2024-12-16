import type { EChartsType } from "echarts/core";
import type React from "react";
import { useEffect, useMemo } from "react";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import TooltipStyles from "metabase/visualizations/components/ChartTooltip/EChartsTooltip/EChartsTooltip.module.css";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { ClickObject } from "metabase-lib";

import type { BaseCartesianChartModel } from "../cartesian/model/types";
import type { PieChartModel, SliceTreeNode } from "../pie/model/types";
import { getArrayFromMapValues } from "../pie/util";

export const TOOLTIP_POINTER_MARGIN = 10;

export const getTooltipPositionFn =
  (containerRef: React.RefObject<HTMLDivElement>) =>
  (
    relativePoint: [number, number],
    _params: unknown,
    _tooltipContainer: unknown,
    _rect: unknown,
    size: { contentSize: [number, number] },
  ) => {
    const { clientWidth, clientHeight } = document.documentElement;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const containerX = containerRect?.x ?? 0;
    const containerY = containerRect?.y ?? 0;
    const mouseX = relativePoint[0] + containerX;
    const mouseY = relativePoint[1] + containerY;

    const tooltipTotalWidth = size.contentSize[0] + TOOLTIP_POINTER_MARGIN;
    const tooltipTotalHeight = size.contentSize[1] + TOOLTIP_POINTER_MARGIN;

    let tooltipAbsoluteX = 0;
    const hasRightSpace = mouseX + tooltipTotalWidth <= clientWidth;
    const hasLeftSpace = mouseX - tooltipTotalWidth >= 0;

    if (hasRightSpace) {
      tooltipAbsoluteX = mouseX + TOOLTIP_POINTER_MARGIN;
    } else if (hasLeftSpace) {
      tooltipAbsoluteX = mouseX - tooltipTotalWidth;
    }

    let tooltipAbsoluteY = 0;
    const hasTopSpace = mouseY - tooltipTotalHeight >= 0;
    const hasBottomSpace = mouseY + tooltipTotalHeight <= clientHeight;

    if (hasTopSpace) {
      tooltipAbsoluteY = mouseY - tooltipTotalHeight;
    } else if (hasBottomSpace) {
      tooltipAbsoluteY = mouseY + TOOLTIP_POINTER_MARGIN;
    }

    const tooltipRelativeX = tooltipAbsoluteX - containerX;
    const tooltipRelativeY = tooltipAbsoluteY - containerY;

    return [tooltipRelativeX, tooltipRelativeY];
  };

export const getTooltipBaseOption = (
  containerRef: React.RefObject<HTMLDivElement>,
) => {
  return {
    className: TooltipStyles.ChartTooltipRoot,
    appendTo: () => {
      let container = document.querySelector(
        ".echarts-tooltip-container",
      ) as HTMLDivElement;
      if (!container) {
        container = document.createElement("div");
        container.classList.add("echarts-tooltip-container");
        container.style.setProperty("overflow", "hidden");
        container.style.setProperty("position", "absolute");
        container.style.setProperty("inset", "0");
        container.style.setProperty("pointer-events", "none");

        document.body.append(container);
      }

      return container;
    },
    position: getTooltipPositionFn(containerRef),
  };
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

export const useClickedStateTooltipSync = (
  chart?: EChartsType,
  clicked?: ClickObject,
) => {
  useEffect(
    function toggleTooltip() {
      const isTooltipEnabled = clicked == null;
      chart?.setOption({ tooltip: { show: isTooltipEnabled } }, false);
    },
    [chart, clicked],
  );
};

export const useCartesianChartSeriesColorsClasses = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
) => {
  const hexColors = useMemo(() => {
    const seriesColors = chartModel.seriesModels
      .map(seriesModel => seriesModel.color)
      .filter(isNotNull);

    const settingColors = [
      settings["waterfall.increase_color"],
      settings["waterfall.decrease_color"],
      settings["waterfall.total_color"],
    ].filter(isNotNull);

    return [...seriesColors, ...settingColors];
  }, [chartModel, settings]);

  return useInjectSeriesColorsClasses(hexColors);
};

function getColorsFromSlices(slices: SliceTreeNode[]) {
  const colors = slices.map(s => s.color);
  slices.forEach(s =>
    colors.push(...getColorsFromSlices(getArrayFromMapValues(s.children))),
  );
  return colors;
}

export const usePieChartValuesColorsClasses = (chartModel: PieChartModel) => {
  const hexColors = useMemo(() => {
    return getColorsFromSlices(getArrayFromMapValues(chartModel.sliceTree));
  }, [chartModel]);

  return useInjectSeriesColorsClasses(hexColors);
};

export const useCloseTooltipOnScroll = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
) => {
  useEffect(() => {
    const handleScroll = _.throttle(() => {
      chartRef.current?.dispatchAction({
        type: "hideTip",
      });
    }, 50);

    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [chartRef]);
};
