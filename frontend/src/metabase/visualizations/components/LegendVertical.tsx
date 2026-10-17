import cx from "classnames";
import { useRef } from "react";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { Popover } from "metabase/ui";
import { useLegendOverflow } from "metabase/visualizations/hooks/use-legend-overflow";

import LegendS from "./Legend.module.css";
import { LegendItem } from "./LegendItem";
import { getOverflowLabel } from "./legend/layout";
import type { LegendProps } from "./types";

export function LegendVertical({
  className,
  titles,
  colors,
  hiddenIndices = [],
  hovered,
  onHoverChange,
  onToggleSeriesVisibility,
}: LegendProps) {
  const { visibleCount, containerRef, itemRefs } = useLegendOverflow({
    titles,
    minVisibleCount: 0,
    axis: "vertical",
  });
  const legendItemRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  return (
    <ol
      className={cx(className, LegendS.Legend, LegendS.vertical)}
      ref={containerRef}
    >
      {titles.slice(0, visibleCount).map((title, index) => {
        const isMuted = hovered?.index != null && index !== hovered.index;
        const legendItemTitle = Array.isArray(title) ? title[0] : title;
        const isVisible = !hiddenIndices.includes(index);

        const handleMouseEnter = () => {
          onHoverChange?.({
            index,
            element: legendItemRefs.current[index] ?? undefined,
          });
        };

        const handleMouseLeave = () => {
          onHoverChange?.();
        };

        return (
          <li
            key={index}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className={cx(CS.flex, CS.flexNoShrink)}
            onMouseEnter={() => {
              if (isVisible) {
                handleMouseEnter();
              }
            }}
            onMouseLeave={handleMouseLeave}
            data-testid={`legend-item-${legendItemTitle}`}
            aria-current={hovered ? !isMuted : undefined}
          >
            <LegendItem
              ref={(legendItem) => {
                legendItemRefs.current[index] = legendItem;
              }}
              title={legendItemTitle}
              color={colors[index % colors.length]}
              isMuted={isMuted}
              isVisible={isVisible}
              showTooltip={false}
              onToggleSeriesVisibility={(event) => {
                if (isVisible) {
                  handleMouseLeave();
                } else {
                  handleMouseEnter();
                }
                onToggleSeriesVisibility?.(event, index);
              }}
            />
            {Array.isArray(title) && (
              <span
                className={cx(
                  LegendS.LegendItem,
                  DashboardS.DashboardChartLegend,
                  CS.flex,
                  CS.alignCenter,
                  CS.flexAlignRight,
                  CS.pl1,
                  { [LegendS.LegendItemMuted]: isMuted },
                )}
              >
                {title[1]}
              </span>
            )}
          </li>
        );
      })}
      {visibleCount < titles.length && (
        <LegendOverflow
          titles={titles}
          colors={colors}
          hiddenIndices={hiddenIndices}
          visibleCount={visibleCount}
          onToggleSeriesVisibility={onToggleSeriesVisibility}
        />
      )}
    </ol>
  );
}

type LegendOverflowProps = Pick<
  LegendProps,
  "titles" | "colors" | "hiddenIndices" | "onToggleSeriesVisibility"
> & {
  visibleCount: number;
};

export function LegendOverflow({
  titles,
  colors,
  hiddenIndices = [],
  visibleCount,
  onToggleSeriesVisibility,
}: LegendOverflowProps) {
  const foldedCount = titles.length - visibleCount;

  return (
    <Popover>
      <Popover.Target>
        <li className={cx(CS.flex, CS.flexNoShrink, CS.cursorPointer)}>
          <LegendItem
            title={getOverflowLabel(foldedCount)}
            color="gray"
            showTooltip={false}
          />
        </li>
      </Popover.Target>
      <Popover.Dropdown>
        <LegendVertical
          className={CS.p2}
          titles={titles.slice(-foldedCount)}
          colors={colors
            .slice(-foldedCount)
            .concat(colors.slice(0, -foldedCount))}
          hiddenIndices={hiddenIndices
            .filter((i) => i >= visibleCount)
            .map((i) => i - visibleCount)}
          onToggleSeriesVisibility={(event, sliceIndex) =>
            onToggleSeriesVisibility?.(event, sliceIndex + visibleCount)
          }
        />
      </Popover.Dropdown>
    </Popover>
  );
}
