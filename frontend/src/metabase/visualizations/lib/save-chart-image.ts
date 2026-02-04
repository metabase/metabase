import { isStorybookActive } from "metabase/env";
import { openImageBlobOnStorybook } from "metabase/lib/loki-utils";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

import {
  createBrandingElement,
  getBrandingConfig,
  getBrandingSize,
} from "./exports-branding-utils";

export const SAVING_DOM_IMAGE_CLASS = "saving-dom-image";
export const SAVING_DOM_IMAGE_HIDDEN_CLASS = "saving-dom-image-hidden";

interface Opts {
  selector: string;
  fileName: string;
  includeBranding: boolean;
  presentationMode?: boolean;
}

const PRESENTATION_EXPORT_CLASS = "saving-dom-image-presentation";
const PRESENTATION_EXPORT_STYLE_ID = "mb-saving-dom-image-presentation-style";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

type PresentationTypography = {
  legendText: number;
  valueText: number;
  tableText: number;
  tableLineHeight: number;
};

type ChartKind = "table" | "donut" | "cartesian" | "other";

const getChartKind = (node: HTMLElement): ChartKind => {
  if (node.querySelector("table")) {
    return "table";
  }
  if (
    node.querySelector(
      ".dc-chart .pie-slice, .dc-chart .pie-label, .dc-chart .donut, .dc-chart .arc",
    )
  ) {
    return "donut";
  }
  if (
    node.querySelector(
      ".dc-chart .axis .tick text, .dc-chart .x-axis-label, .dc-chart .y-axis-label",
    )
  ) {
    return "cartesian";
  }
  return "other";
};

type CaptureBounds = {
  width: number;
  height: number;
};

const getPresentationCaptureBounds = (
  node: HTMLElement,
  chartKind: ChartKind,
): CaptureBounds => {
  const rootRect = node.getBoundingClientRect();
  // Keep native capture bounds for charts to avoid clipping legends/branding/axes.
  // We only tighten bounds for table-like renders where empty canvas is common.
  if (chartKind !== "table") {
    return {
      width: rootRect.width,
      height: rootRect.height,
    };
  }

  const rootArea = rootRect.width * rootRect.height;

  let maxRight = rootRect.left;
  let maxBottom = rootRect.top;
  let found = false;

  const elements = Array.from(node.querySelectorAll("*"));
  for (const element of elements) {
    if (!(element instanceof Element)) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      continue;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      continue;
    }

    const area = rect.width * rect.height;
    const areaRatio = rootArea > 0 ? area / rootArea : 1;
    const isLikelyBackgroundWrapper =
      areaRatio > 0.92 &&
      !element.matches("table, svg, canvas, .dc-chart, .Visualization");
    if (isLikelyBackgroundWrapper) {
      continue;
    }

    const clampedRight = Math.min(rect.right, rootRect.right);
    const clampedBottom = Math.min(rect.bottom, rootRect.bottom);
    if (clampedRight <= rootRect.left || clampedBottom <= rootRect.top) {
      continue;
    }

    found = true;
    maxRight = Math.max(maxRight, clampedRight);
    maxBottom = Math.max(maxBottom, clampedBottom);
  }

  if (!found) {
    return {
      width: rootRect.width,
      height: rootRect.height,
    };
  }

  const rightPadding = chartKind === "table" ? 12 : 24;
  const bottomPadding = chartKind === "cartesian" ? 48 : 24;

  return {
    width: clamp(maxRight - rootRect.left + rightPadding, 240, rootRect.width),
    height: clamp(
      maxBottom - rootRect.top + bottomPadding,
      160,
      rootRect.height,
    ),
  };
};

const getPresentationTypography = (
  node: HTMLElement,
  contentWidth: number,
  contentHeight: number,
  chartKind: ChartKind,
): PresentationTypography => {
  const referenceWidth = 1600;
  const referenceHeight = 900;

  const widthScale = clamp(contentWidth / referenceWidth, 0.85, 1.35);
  const heightScale = clamp(contentHeight / referenceHeight, 0.9, 1.25);
  const sizeScale = Math.min(widthScale, heightScale);

  const axisTickCount = node.querySelectorAll(
    ".dc-chart .axis .tick text",
  ).length;
  const valueLabelCount = node.querySelectorAll(
    "text.value-label, text.value-label-white",
  ).length;
  const densityCount = axisTickCount + valueLabelCount;

  let densityScale = 1;
  if (densityCount > 60) {
    densityScale = 0.9;
  } else if (densityCount > 40) {
    densityScale = 0.95;
  } else if (densityCount > 24) {
    densityScale = 1;
  } else if (densityCount < 12) {
    densityScale = 1.12;
  }

  const scale = sizeScale * densityScale;

  let legendText = 28;
  let valueText = 28;
  let tableText = 20;

  if (chartKind === "table") {
    legendText = 20;
    valueText = 18;
    tableText = 22;
  } else if (chartKind === "donut") {
    legendText = 28;
    valueText = 26;
    tableText = 18;
  } else if (chartKind === "other") {
    legendText = 24;
    valueText = 24;
    tableText = 19;
  }

  return {
    legendText: clamp(Math.round(legendText * scale), 20, 40),
    valueText: clamp(Math.round(valueText * scale), 18, 42),
    tableText: clamp(Math.round(tableText * scale), 16, 30),
    tableLineHeight: clamp(1.45 * (1 / densityScale), 1.35, 1.65),
  };
};

const appendPresentationExportStyles = (
  doc: Document,
  typography: PresentationTypography,
) => {
  const { legendText, valueText, tableText, tableLineHeight } = typography;

  const css = `
    .${PRESENTATION_EXPORT_CLASS} .dc-chart .y-axis-label {
      display: none !important;
    }
    .${PRESENTATION_EXPORT_CLASS} .DashboardChartLegend {
      font-size: ${legendText}px !important;
      line-height: 1.3 !important;
      font-weight: 700 !important;
    }
    .${PRESENTATION_EXPORT_CLASS} text.value-label,
    .${PRESENTATION_EXPORT_CLASS} text.value-label-white {
      font-size: ${valueText}px !important;
      font-weight: 700 !important;
    }
    .${PRESENTATION_EXPORT_CLASS} table th,
    .${PRESENTATION_EXPORT_CLASS} table td {
      font-size: ${tableText}px !important;
      line-height: ${tableLineHeight} !important;
    }
  `;

  let style = doc.getElementById(
    PRESENTATION_EXPORT_STYLE_ID,
  ) as HTMLStyleElement | null;

  if (!style) {
    style = doc.createElement("style");
    style.id = PRESENTATION_EXPORT_STYLE_ID;
    doc.head.appendChild(style);
  }

  style.textContent = css;
};

const applyInlinePresentationTypography = (
  node: HTMLElement,
  typography: PresentationTypography,
) => {
  const { legendText, valueText, tableText, tableLineHeight } = typography;

  node
    .querySelectorAll<SVGTextElement>(
      "text.value-label, text.value-label-white",
    )
    .forEach((el) => {
      el.style.fontSize = `${valueText}px`;
      el.style.fontWeight = "700";
      el.setAttribute("font-size", `${valueText}px`);
    });

  node.querySelectorAll<HTMLElement>(".DashboardChartLegend").forEach((el) => {
    el.style.fontSize = `${legendText}px`;
    el.style.lineHeight = "1.3";
    el.style.fontWeight = "700";
  });

  node.querySelectorAll<HTMLElement>("table th, table td").forEach((el) => {
    el.style.fontSize = `${tableText}px`;
    el.style.lineHeight = `${tableLineHeight}`;
  });
};

export const saveChartImage = async ({
  selector,
  fileName,
  includeBranding,
  presentationMode = false,
}: Opts) => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  const contentHeight = node.getBoundingClientRect().height;
  const contentWidth = node.getBoundingClientRect().width;
  const chartKind = presentationMode ? getChartKind(node) : "other";
  const captureBounds = presentationMode
    ? getPresentationCaptureBounds(node, chartKind)
    : { width: contentWidth, height: contentHeight };

  const size = getBrandingSize(captureBounds.width);
  const brandingHeight = getBrandingConfig(size).h;
  const verticalOffset = includeBranding ? brandingHeight : 0;

  // Appending any element to the node does not automatically increase the canvas height.
  const canvasHeight = captureBounds.height + verticalOffset;

  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    width: captureBounds.width,
    height: canvasHeight,
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.classList.add(EmbedFrameS.WithThemeBackground);
      node.style.width = `${captureBounds.width}px`;

      node.style.borderRadius = "0px";
      node.style.border = "none";

      if (presentationMode) {
        const typography = getPresentationTypography(
          node,
          captureBounds.width,
          captureBounds.height,
          chartKind,
        );
        appendPresentationExportStyles(_doc, typography);
        applyInlinePresentationTypography(node, typography);
        node.classList.add(PRESENTATION_EXPORT_CLASS);
      }

      if (includeBranding) {
        const branding = createBrandingElement(size);
        /**
         * The DOM node that encapsulates the dashboard card is absolutely positioned.
         * That node is the container for the chart, and for the branding element.
         * Unless we sanitize the container, we have to position the branding content
         * appropriately, or it will not be visible.
         */
        branding.style.position = "absolute";
        branding.style.left = "0";
        branding.style.bottom = `-${brandingHeight}px`;
        branding.style.zIndex = "1000";

        node.appendChild(branding);
      }
    },
  });

  canvas.toBlob((blob) => {
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
  });
};
