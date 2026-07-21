import cx from "classnames";
import { type MouseEvent, useRef } from "react";

import type { HoveredObject } from "metabase/visualizations/types";

import LegendS from "./Legend.module.css";
import { LegendItem } from "./LegendItem";

interface LegendHorizontalProps {
  className?: string;
  titles: (string | string[])[];
  colors: string[];
  hiddenIndices?: number[];
  hovered?: HoveredObject | null;
  onHoverChange?: (
    hover?: { index: number; element?: HTMLElement | null } | null,
  ) => void;
  onToggleSeriesVisibility?: (event: MouseEvent, index: number) => void;
}

export function LegendHorizontal({
  className,
  titles,
  colors,
  hiddenIndices = [],
  hovered,
  onHoverChange,
  onToggleSeriesVisibility,
}: LegendHorizontalProps) {
  const legendItemRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  return (
    <ol className={cx(className, LegendS.Legend, LegendS.horizontal)}>
      {titles.map((title, index) => {
        const isMuted = Boolean(
          hovered && hovered.index != null && index !== hovered.index,
        );
        const isVisible = !hiddenIndices.includes(index);

        const handleMouseEnter = () => {
          onHoverChange?.({
            index,
            element: legendItemRefs.current[index],
          });
        };

        const handleMouseLeave = () => {
          onHoverChange?.(null);
        };

        return (
          <li
            key={index}
            data-testid={`legend-item-${title}`}
            aria-current={hovered ? !isMuted : undefined}
          >
            <LegendItem
              ref={(legendItem) => {
                legendItemRefs.current[index] = legendItem;
              }}
              title={title}
              color={colors[index % colors.length]}
              isMuted={isMuted}
              isVisible={isVisible}
              showTooltip={false}
              onMouseEnter={() => {
                if (isVisible) {
                  handleMouseEnter();
                }
              }}
              onMouseLeave={handleMouseLeave}
              onToggleSeriesVisibility={(event) => {
                if (isVisible) {
                  handleMouseLeave();
                } else {
                  handleMouseEnter();
                }
                onToggleSeriesVisibility?.(event, index);
              }}
            />
          </li>
        );
      })}
    </ol>
  );
}
