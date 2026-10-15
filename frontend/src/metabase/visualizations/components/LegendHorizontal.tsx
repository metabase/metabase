import cx from "classnames";
import { useRef } from "react";

import CS from "metabase/css/core/index.css";
import { useLegendOverflow } from "metabase/visualizations/hooks/use-legend-overflow";

import LegendS from "./Legend.module.css";
import { LegendItem } from "./LegendItem";
import { LegendOverflow } from "./LegendVertical";
import { MIN_VISIBLE_COUNT } from "./legend/layout";
import type { LegendProps } from "./types";

type LegendHorizontalProps = LegendProps & {
  isSingleRow?: boolean;
};

export function LegendHorizontal({
  className,
  titles,
  colors,
  hiddenIndices = [],
  hovered,
  onHoverChange,
  onToggleSeriesVisibility,
  isSingleRow = false,
}: LegendHorizontalProps) {
  const legendItemRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const { overflowCount, visibleCount, containerRef, itemRefs } =
    useLegendOverflow({
      itemCount: titles.length,
      itemsKey: JSON.stringify(titles),
      minVisibleCount: MIN_VISIBLE_COUNT,
      axis: "horizontal",
      isEnabled: isSingleRow,
    });
  const isMeasuring = overflowCount === 0;

  return (
    <ol
      className={cx(className, LegendS.Legend, LegendS.horizontal, {
        [LegendS.singleRow]: isSingleRow,
      })}
      ref={containerRef}
    >
      {titles.slice(0, visibleCount).map((title, index) => {
        const isMuted = hovered?.index != null && index !== hovered.index;
        const isVisible = !hiddenIndices.includes(index);

        const handleMouseEnter = () => {
          onHoverChange?.({
            index,
            element: legendItemRefs.current[index] ?? undefined,
          });
        };

        const handleMouseLeave = () => {
          onHoverChange?.(null);
        };

        return (
          <li
            key={index}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className={
              isSingleRow
                ? cx(LegendS.singleRowItem, { [CS.flexNoShrink]: isMeasuring })
                : undefined
            }
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
