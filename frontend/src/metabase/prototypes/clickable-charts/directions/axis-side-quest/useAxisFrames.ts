import { type RefObject, useLayoutEffect, useState } from "react";
import _ from "underscore";

export type AxisTitleFrame = {
  /** The measure or dimension the title names, as the chart wrote it. */
  text: string;
  centerX: number;
  centerY: number;
  fontSize: string;
  fontWeight?: string;
  isVertical?: boolean;
  /** Set when the title is a legend item: its dot, drawn the same in the pill. */
  legendDot?: { color: string; size: string; gap: string };
};

export type AxisFrameKind = "axis" | "legend";

/** Matches the axis pill's padding plus its 1px border, so the pill fits the slot. */
const LEGEND_PILL_INSET = "0 calc(0.5rem + 1px)";

/**
 * Where the chart draws a title naming one of `names` (svg axis titles, or
 * legend items), relative to the container, kept up to date as the chart
 * re-renders. The originals are hidden so a pill can take their place.
 */
export function useAxisFrames(
  containerRef: RefObject<HTMLDivElement>,
  names: string[] | undefined,
  kind: AxisFrameKind = "axis",
): AxisTitleFrame[] {
  const [frames, setFrames] = useState<AxisTitleFrame[]>([]);
  const key = names?.join("\u0000");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const wanted = key != null ? key.split("\u0000") : undefined;
    if (!container || !wanted) {
      setFrames([]);
      return;
    }
    const update = () => {
      const containerRect = container.getBoundingClientRect();
      const nextFrames = findTitles(container, wanted, kind).flatMap((el) => {
        if (kind === "legend") {
          return [getLegendFrame(el, containerRect)];
        }
        return el instanceof SVGTextElement
          ? [getAxisFrame(el, containerRect)]
          : [];
      });
      setFrames((previous) =>
        _.isEqual(previous, nextFrames) ? previous : nextFrames,
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [containerRef, key, kind]);

  return frames;
}

function findTitles(
  container: HTMLElement,
  names: string[],
  kind: AxisFrameKind,
): Element[] {
  const selector =
    kind === "legend" ? '[data-testid="legend-item"]' : "svg text";
  return Array.from(container.querySelectorAll(selector)).filter((el) =>
    names.includes(el.textContent?.trim() ?? ""),
  );
}

function getAxisFrame(
  title: SVGTextElement,
  containerRect: DOMRect,
): AxisTitleFrame {
  const matrix = title.transform.baseVal.consolidate()?.matrix;
  title.style.visibility = "hidden";
  const rect = title.getBoundingClientRect();
  return {
    text: title.textContent?.trim() ?? "",
    centerX: Math.round(rect.left - containerRect.left + rect.width / 2),
    centerY: Math.round(rect.top - containerRect.top + rect.height / 2),
    fontSize: getComputedStyle(title).fontSize,
    isVertical: matrix != null && Math.abs(matrix.a) < 0.01,
  };
}

/**
 * A legend item, hidden for a pill to take its place: dot, gap and type are
 * read off it so the pill draws them the same.
 */
function getLegendFrame(item: Element, containerRect: DOMRect): AxisTitleFrame {
  const label = item.firstElementChild;
  const dot = label?.firstElementChild;
  const title = dot?.nextElementSibling;
  if (item instanceof HTMLElement) {
    item.style.padding = LEGEND_PILL_INSET;
  }
  if (label instanceof HTMLElement) {
    label.style.visibility = "hidden";
  }
  const rect = item.getBoundingClientRect();
  const titleStyle = title ? getComputedStyle(title) : undefined;
  return {
    text: item.textContent?.trim() ?? "",
    centerX: Math.round(rect.left - containerRect.left + rect.width / 2),
    centerY: Math.round(rect.top - containerRect.top + rect.height / 2),
    fontSize: titleStyle?.fontSize ?? "",
    fontWeight: titleStyle?.fontWeight,
    legendDot:
      dot instanceof HTMLElement
        ? {
            color: dot.style.getPropertyValue("--legend-dot-color"),
            size: dot.style.width,
            gap: titleStyle?.marginLeft ?? "0",
          }
        : undefined,
  };
}
