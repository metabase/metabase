// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

import GlobalDashboardS from "metabase/css/dashboard.module.css";
import DashboardGridS from "metabase/dashboard/components/DashboardGrid.module.css";
import {
  DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID,
  DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_CLASSNAME,
} from "metabase/dashboard/constants";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isStorybookActive } from "metabase/env";
import { color } from "metabase/lib/colors";
import { utf8_to_b64 } from "metabase/lib/encoding";
import { openImageBlobOnStorybook } from "metabase/lib/loki-utils";
import { measureTextWidth } from "metabase/lib/measure-text";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

import { getCardKey } from "./utils";

export const SAVING_DOM_IMAGE_CLASS = "saving-dom-image";
export const SAVING_DOM_IMAGE_HIDDEN_CLASS = "saving-dom-image-hidden";
export const SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS =
  "saving-dom-image-display-none";
export const SAVING_DOM_IMAGE_OVERFLOW_VISIBLE_CLASS =
  "saving-dom-image-overflow-visible";
export const PARAMETERS_MARGIN_BOTTOM = 12;

export const saveDomImageStyles = css`
  .${SAVING_DOM_IMAGE_CLASS} {
    .${SAVING_DOM_IMAGE_HIDDEN_CLASS} {
      visibility: hidden;
    }
    .${SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS} {
      display: none;
    }
    .${SAVING_DOM_IMAGE_OVERFLOW_VISIBLE_CLASS} {
      overflow: visible;
    }

    .${DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_CLASSNAME} {
      legend {
        top: -9px;
      }
    }

    .${DashboardGridS.DashboardCardContainer} .${GlobalDashboardS.Card} {
      /* the renderer we use for saving to image/pdf doesn't support box-shadow
        so we replace it with a border */
      box-shadow: none;
      border: 1px solid var(--mb-color-border);
    }

    /* the renderer for saving to image/pdf does not support text overflow
     with line height in custom themes in the embedding sdk.
     this is a workaround to make sure the text is not clipped vertically */
    ${isEmbeddingSdk() &&
    css`
      .${DashboardGridS.DashboardCardContainer} .${GlobalDashboardS.Card} * {
        overflow: visible !important;
      }
    `};
  }
`;

export const getDomToCanvas = async (
  element: HTMLElement,
  options: {
    width?: number;
    height?: number;
    useCORS?: boolean;
    scale?: number;
    onclone?: (doc: Document, node: HTMLElement) => void;
  } = {},
) => {
  const { default: html2canvas } = await import("html2canvas-pro");
  return html2canvas(element, {
    useCORS: options.useCORS ?? true,
    width: options.width,
    height: options.height,
    scale: options.scale,
    onclone: options.onclone,
  });
};

export const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type = "image/png",
): Promise<Blob | null> => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
};

export const blobToFile = (
  blob: Blob,
  filename: string,
  type = "image/png",
): File => {
  return new File([blob], filename, { type });
};

export interface DashboardRenderSetup {
  gridNode: HTMLElement;
  contentWidth: number;
  contentHeight: number;
  parametersNode: HTMLElement | null;
  parametersHeight: number;
  backgroundColor: string;
}

export const setupDashboardForRendering = (
  selector: string,
): DashboardRenderSetup | undefined => {
  const dashboardRoot = document.querySelector(selector);
  const gridNode = dashboardRoot?.querySelector(".react-grid-layout");

  if (!gridNode || !(gridNode instanceof HTMLElement)) {
    console.warn("No dashboard content found", selector);
    return undefined;
  }

  const pageHeaderParametersNode = dashboardRoot
    ?.querySelector(`#${DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID}`)
    ?.cloneNode(true);

  let parametersHeight = 0;
  if (pageHeaderParametersNode instanceof HTMLElement) {
    gridNode.append(pageHeaderParametersNode);
    pageHeaderParametersNode.style.cssText = `margin-bottom: ${PARAMETERS_MARGIN_BOTTOM}px`;
    parametersHeight =
      pageHeaderParametersNode.getBoundingClientRect().height +
      PARAMETERS_MARGIN_BOTTOM;
    gridNode.removeChild(pageHeaderParametersNode);
  }

  const contentWidth = gridNode.offsetWidth;
  const contentHeight = gridNode.offsetHeight + parametersHeight;

  const backgroundColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--mb-color-bg-dashboard")
    .trim();

  return {
    gridNode,
    contentWidth,
    contentHeight,
    parametersNode:
      pageHeaderParametersNode instanceof HTMLElement
        ? pageHeaderParametersNode
        : null,
    parametersHeight,
    backgroundColor,
  };
};

export const getDashboardImage = async (
  selector: string,
): Promise<string | undefined> => {
  const setup = setupDashboardForRendering(selector);
  if (!setup) {
    return undefined;
  }

  const {
    gridNode,
    contentWidth,
    contentHeight,
    parametersNode,
    backgroundColor,
  } = setup;

  const canvas = await getDomToCanvas(gridNode, {
    height: contentHeight,
    width: contentWidth,
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.style.height = `${contentHeight}px`;
      node.style.backgroundColor = backgroundColor;
      if (parametersNode) {
        node.insertBefore(parametersNode, node.firstChild);
      }
    },
  });

  return canvas.toDataURL("image/png").split(",")[1];
};

interface LegendItem {
  color: string;
  label: string;
}

const LEGEND_CONFIG = {
  dotRadius: 5,
  fontSize: 12, // Smaller font to match actual legend
  fontFamily: "Lato, sans-serif",
  fontWeight: "700",
  itemGap: 16, // Gap between items
  rowHeight: 20,
  paddingX: 16,
  paddingY: 8,
  dotToTextGap: 8,
  maxWidth: 600, // Max width for legend row before wrapping
} as const;

function rgbToHex(rgb: string): string {
  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return rgb;
  }
  const [, r, g, b] = match;
  const toHex = (n: string) => {
    const hex = parseInt(n, 10).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function isTransparentColor(bgColor: string): boolean {
  return bgColor === "transparent" || bgColor.startsWith("rgba(0, 0, 0, 0");
}

function extractLegendItems(container: HTMLElement): LegendItem[] {
  const items = container.querySelectorAll('[data-testid="legend-item"]');

  return Array.from(items).flatMap((item) => {
    const dotContainer =
      item.querySelector('[data-testid="legend-item-dot"]') ??
      item.querySelector("button");

    if (!dotContainer) {
      return [];
    }

    // The legend dot has two divs: OuterCircle (border color) and InnerCircle (series color)
    // We want the InnerCircle which is the second div
    const circles = Array.from(dotContainer.querySelectorAll("div"));
    const innerCircle = circles.length >= 2 ? circles[1] : circles[0];

    if (!innerCircle) {
      return [];
    }

    const bgColor = getComputedStyle(innerCircle).backgroundColor;
    if (isTransparentColor(bgColor)) {
      return [];
    }

    const color = rgbToHex(bgColor);
    const label = item.textContent?.trim() ?? "";

    return color && label ? [{ color, label }] : [];
  });
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function getTextColor(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--mb-color-text-primary")
      .trim() || color("white")
  );
}

function measureLegendTextWidth(text: string): number {
  const { fontSize, fontFamily, fontWeight } = LEGEND_CONFIG;
  return measureTextWidth(text, {
    size: fontSize,
    family: fontFamily,
    weight: fontWeight,
  });
}

function calculateItemWidth(label: string): number {
  const { dotRadius, dotToTextGap, itemGap } = LEGEND_CONFIG;
  const textWidth = measureLegendTextWidth(label);
  return dotRadius * 2 + dotToTextGap + textWidth + itemGap;
}

interface LegendLayout {
  x: number;
  y: number;
}

function calculateLegendLayout(legendItems: LegendItem[]): LegendLayout[] {
  const { paddingX, rowHeight, maxWidth } = LEGEND_CONFIG;

  const layout: LegendLayout[] = [];
  let currentX = paddingX;
  let currentY = 0;

  for (const item of legendItems) {
    const itemWidth = calculateItemWidth(item.label);

    // Wrap to next row if item doesn't fit
    if (currentX + itemWidth > maxWidth && currentX > paddingX) {
      currentX = paddingX;
      currentY += rowHeight;
    }

    layout.push({ x: currentX, y: currentY });
    currentX += itemWidth;
  }

  return layout;
}

function renderLegendAsSvg(
  legendItems: LegendItem[],
  startY: number,
): SVGGElement {
  const { dotRadius, fontSize, paddingY, dotToTextGap } = LEGEND_CONFIG;

  const legendGroup = createSvgElement("g", { class: "chart-legend" });
  const textColor = getTextColor();
  const layout = calculateLegendLayout(legendItems);

  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    const { x, y } = layout[i];
    const actualY = startY + paddingY + y + dotRadius;

    const itemGroup = createSvgElement("g", {});

    const circle = createSvgElement("circle", {
      cx: x,
      cy: actualY,
      r: dotRadius,
      fill: item.color,
    });
    itemGroup.appendChild(circle);

    const text = createSvgElement("text", {
      x: x + dotRadius + dotToTextGap,
      y: actualY + 4,
      "font-size": fontSize,
      "font-family": "Lato, sans-serif",
      "font-weight": "700",
      fill: textColor,
    });
    text.textContent = item.label;
    itemGroup.appendChild(text);

    legendGroup.appendChild(itemGroup);
  }

  return legendGroup;
}

function getBasicSvgDataUri(selector: string): string | undefined {
  const element = document.querySelector(selector)?.cloneNode(true);
  if (element && !(element instanceof SVGElement)) {
    throw new Error("Selector did not provide an SVG element");
  }

  if (!element) {
    return undefined;
  }

  const svgString = new XMLSerializer().serializeToString(element);
  return `data:image/svg+xml;base64,${utf8_to_b64(svgString)}`;
}

function calculateLegendHeight(legendItems: LegendItem[]): number {
  if (legendItems.length === 0) {
    return 0;
  }

  const layout = calculateLegendLayout(legendItems);
  const lastItem = layout[layout.length - 1];
  const { rowHeight, paddingY } = LEGEND_CONFIG;

  // Height = last item's Y position + one row height + padding
  return lastItem.y + rowHeight + paddingY * 2;
}

function copyChildrenToGroup(source: SVGElement, target: SVGGElement): void {
  for (const child of source.children) {
    target.appendChild(child.cloneNode(true));
  }
}

export function getVisualizationSvgDataUri(
  selector: string,
): string | undefined {
  const container = document.querySelector(selector);
  if (!(container instanceof HTMLElement)) {
    return undefined;
  }

  const chartSvg = container.querySelector('svg:not([role="img"])');
  const fallbackSelector = `${selector} svg:not([role="img"])`;

  if (!(chartSvg instanceof SVGElement)) {
    return getBasicSvgDataUri(fallbackSelector);
  }

  const legendItems = extractLegendItems(container);
  if (legendItems.length === 0) {
    return getBasicSvgDataUri(fallbackSelector);
  }

  const chartRect = chartSvg.getBoundingClientRect();
  const legendHeight = calculateLegendHeight(legendItems);
  const totalHeight = chartRect.height + legendHeight;

  const wrapperSvg = createSvgElement("svg", {
    width: chartRect.width,
    height: totalHeight,
    viewBox: `0 0 ${chartRect.width} ${totalHeight}`,
    xmlns: "http://www.w3.org/2000/svg",
  });

  const legendSvg = renderLegendAsSvg(legendItems, 0);
  wrapperSvg.appendChild(legendSvg);

  const chartGroup = createSvgElement("g", {
    transform: `translate(0, ${legendHeight})`,
  });
  copyChildrenToGroup(chartSvg.cloneNode(true) as SVGElement, chartGroup);
  wrapperSvg.appendChild(chartGroup);

  const svgString = new XMLSerializer().serializeToString(wrapperSvg);
  return `data:image/svg+xml;base64,${utf8_to_b64(svgString)}`;
}

export const getChartSelector = (
  input: { dashcardId: number | undefined } | { cardId: number | undefined },
) => {
  if ("dashcardId" in input) {
    return `[data-dashcard-key='${input.dashcardId}']`;
  } else {
    return `[data-card-key='${getCardKey(input.cardId)}']`;
  }
};

export const getChartSvgSelector = (
  input: { dashcardId: number | undefined } | { cardId: number | undefined },
) => {
  // :not selector shouldn't be needed, but just an extra check to make sure
  // we don't accidentally get some kind of svg icon
  return `${getChartSelector(input)} svg:not([role="img"])`;
};

export const getChartImagePngDataUri = async (
  selector: string,
): Promise<string | undefined> => {
  const chartRoot = document.querySelector(selector);

  if (!chartRoot || !(chartRoot instanceof HTMLElement)) {
    console.warn("No chart element found", selector);
    return undefined;
  }

  const canvas = await getDomToCanvas(chartRoot, {
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
    },
  });

  return canvas.toDataURL("image/png");
};

export const saveChartImage = async (selector: string, fileName: string) => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  const canvas = await getDomToCanvas(node, {
    scale: 2,
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.classList.add(EmbedFrameS.WithThemeBackground);

      node.style.borderRadius = "0px";
      node.style.border = "none";
    },
  });

  const blob = await canvasToBlob(canvas);

  if (blob) {
    if (isStorybookActive) {
      // if we're running storybook we open the image in place
      // so we can test the export result with loki
      openImageBlobOnStorybook({ canvas, blob });
    } else {
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.rel = "noopener";
      link.download = fileName;
      link.href = url;
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }
};
