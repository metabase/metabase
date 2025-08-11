import type { EChartsType } from "echarts/core";
import { useEffect, useRef } from "react";
import _ from "underscore";

import { ECHARTS_TOOLTIP_CONTAINER_CLASS } from "metabase/visualizations/echarts/tooltip";
import type { VisualizationProps } from "metabase/visualizations/types";

const ECHARTS_TOOLTIP_SELECTOR = `.${ECHARTS_TOOLTIP_CONTAINER_CLASS} > div`;
const MOUSEMOVE_THROTTLE_MS = 50;

export const useTooltipMouseLeave = (
  chartRef?: React.MutableRefObject<EChartsType | undefined>,
  onHoverChange?: VisualizationProps["onHoverChange"],
  containerRef?: React.RefObject<HTMLDivElement>,
) => {
  const isMouseOverTooltipRef = useRef(false);

  useEffect(() => {
    if (!onHoverChange) {
      return;
    }

    const handleGlobalMouseMove = _.throttle((e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement;
        const tooltipElement = target.closest(
          ECHARTS_TOOLTIP_SELECTOR,
        ) as HTMLElement;

        if (tooltipElement) {
          if (!isMouseOverTooltipRef.current) {
            isMouseOverTooltipRef.current = true;
          }
        } else if (isMouseOverTooltipRef.current) {
          isMouseOverTooltipRef.current = false;

          onHoverChange(null);
          if (chartRef?.current && !chartRef.current.isDisposed()) {
            chartRef.current.dispatchAction({
              type: "hideTip",
            });
            chartRef.current.dispatchAction({
              type: "downplay",
            });
          }
        }
      } catch (error) {
        console.error("Error in tooltip mouse leave handler:", error);
      }
    }, MOUSEMOVE_THROTTLE_MS);

    document.addEventListener("mousemove", handleGlobalMouseMove, true);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove, true);
      handleGlobalMouseMove.cancel();
    };
  }, [chartRef, onHoverChange, containerRef]);
};
