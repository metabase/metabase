import cx from "classnames";
import { type MouseEvent, useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { Popover } from "metabase/ui";
import type { HoveredObject } from "metabase/visualizations/types";

import LegendS from "./Legend.module.css";
import { LegendItem } from "./LegendItem";

interface LegendVerticalProps {
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

export function LegendVertical({
  className,
  titles,
  colors,
  hiddenIndices = [],
  hovered,
  onHoverChange,
  onToggleSeriesVisibility,
}: LegendVerticalProps) {
  const [overflowCount, setOverflowCount] = useState(0);
  const [size, setSize] = useState<DOMRect | null>(null);
  const listContainerRef = useRef<HTMLOListElement>(null);
  const itemRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const legendItemRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const prevOverflowCountRef = useRef(overflowCount);

  // Measures whether legend items overflow the widget area. Runs after every
  // render because the container can resize without any prop or state change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const prevOverflowCount = prevOverflowCountRef.current;
    prevOverflowCountRef.current = overflowCount;

    const containerRect = listContainerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      return;
    }

    // check the height, width may fluctuate depending on the browser causing an infinite loop
    // check overflowCount, because after setting overflowCount the height changes and it causing an infinite loop too
    if (
      size &&
      containerRect.height !== size.height &&
      prevOverflowCount === overflowCount
    ) {
      setOverflowCount(0);
      setSize(containerRect);
    } else if (overflowCount === 0) {
      let currentOverflowCount = 0;
      for (let i = 0; i < titles.length; i++) {
        const itemRect = itemRefs.current[i]?.getBoundingClientRect();
        if (
          itemRect &&
          (containerRect.top > itemRect.top ||
            containerRect.bottom < itemRect.bottom)
        ) {
          currentOverflowCount++;
        }
      }
      if (currentOverflowCount !== overflowCount) {
        setOverflowCount(currentOverflowCount);
        setSize(containerRect);
      }
    }
  });

  const hasOverflow = overflowCount > 0;
  const items = hasOverflow ? titles.slice(0, -overflowCount - 1) : titles;
  const extraItems = hasOverflow ? titles.slice(-overflowCount - 1) : [];
  const extraColors = hasOverflow
    ? colors
        .slice(-overflowCount - 1)
        .concat(colors.slice(0, -overflowCount - 1))
    : [];

  return (
    <ol
      className={cx(className, LegendS.Legend, LegendS.vertical)}
      ref={listContainerRef}
    >
      {items.map((title, index) => {
        const isMuted = Boolean(
          hovered && hovered.index != null && index !== hovered.index,
        );
        const legendItemTitle = Array.isArray(title) ? title[0] : title;
        const isVisible = !hiddenIndices.includes(index);

        const handleMouseEnter = () => {
          onHoverChange?.({
            index,
            element: legendItemRefs.current[index],
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
      {hasOverflow ? (
        <Popover>
          <Popover.Target>
            <li className={cx(CS.flex, CS.flexNoShrink, CS.cursorPointer)}>
              <LegendItem
                title={overflowCount + 1 + " " + t`more`}
                color="gray"
                showTooltip={false}
              />
            </li>
          </Popover.Target>
          <Popover.Dropdown>
            <LegendVertical
              className={CS.p2}
              titles={extraItems}
              colors={extraColors}
              hiddenIndices={hiddenIndices
                .filter((i) => i >= items.length - 1)
                .map((i) => i - items.length)}
              onToggleSeriesVisibility={(event, sliceIndex) =>
                onToggleSeriesVisibility?.(event, sliceIndex + items.length)
              }
            />
          </Popover.Dropdown>
        </Popover>
      ) : null}
    </ol>
  );
}
