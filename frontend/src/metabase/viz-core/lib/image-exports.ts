// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

import GlobalDashboardS from "metabase/css/dashboard.module.css";

import { getCardKey } from "./utils";

export const SAVING_DOM_IMAGE_CLASS = "saving-dom-image";
export const SAVING_DOM_IMAGE_HIDDEN_CLASS = "saving-dom-image-hidden";
export const SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS =
  "saving-dom-image-display-none";
export const SAVING_DOM_IMAGE_OVERFLOW_VISIBLE_CLASS =
  "saving-dom-image-overflow-visible";
export const PARAMETERS_MARGIN_BOTTOM = 12;

export const getSaveDomImageStyles = (allowTextOverflow: boolean) => css`
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

    [data-dashcard-key].${GlobalDashboardS.Card} {
      /* the renderer we use for saving to image/pdf doesn't support box-shadow
        so we replace it with a border */
      box-shadow: none;
      border: 1px solid var(--mb-color-border-neutral);
    }

    /* The export renderer clips text vertically when a custom theme changes the line height.
       The flag works around that by capturing with overflow visible. */
    ${allowTextOverflow &&
    css`
      [data-dashcard-key].${GlobalDashboardS.Card} * {
        overflow: visible !important;
      }
    `};
  }
`;

const SVG_VAR_PAINT_ATTRIBUTES = [
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
];

// html2canvas serializes <svg> to a standalone image where :root custom props are out of
// scope, so var() paint (e.g. white pie-slice borders) is lost. Bake in the resolved value.
export const resolveSvgVarPaint = (root: HTMLElement) => {
  root.querySelectorAll<SVGElement>("svg, svg *").forEach((el) => {
    SVG_VAR_PAINT_ATTRIBUTES.forEach((attr) => {
      const value = el.getAttribute(attr);
      if (value?.includes("var(")) {
        const resolved = getComputedStyle(el).getPropertyValue(attr);
        if (resolved) {
          el.setAttribute(attr, resolved);
        }
      }
    });
  });
};

// html2canvas's clone wipes inline styles off SVG nodes (empty computed cssText in Chrome),
// dropping overflow:visible so nested label <svg>s clip their text. Restore it for export.
export const restoreNestedSvgOverflow = (root: HTMLElement) => {
  root.querySelectorAll<SVGElement>("svg svg").forEach((svg) => {
    svg.style.overflow = "visible";
  });
};

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
    cspNonce: window.MetabaseNonce,
    width: options.width,
    height: options.height,
    scale: options.scale,
    onclone: (doc, node) => {
      options.onclone?.(doc, node);
      resolveSvgVarPaint(node);
      restoreNestedSvgOverflow(node);
    },
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

// html2canvas renders fieldset legends shifted down; nudge them back up in the
// cloned parameter bar before capture.
export const fixParameterLegendOffsetForExport = (
  parametersNode: HTMLElement,
) => {
  parametersNode.querySelectorAll<HTMLElement>("legend").forEach((el) => {
    el.style.top = "-9px";
  });
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
  dashboardRoot: HTMLElement,
  getParametersNode: (dashboardRoot: HTMLElement) => HTMLElement | null,
): DashboardRenderSetup | undefined => {
  const gridNode = dashboardRoot.querySelector(".react-grid-layout");

  if (!gridNode || !(gridNode instanceof HTMLElement)) {
    console.warn("No dashboard content found");
    return undefined;
  }

  const pageHeaderParametersNode =
    getParametersNode(dashboardRoot)?.cloneNode(true);

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
  parametersNodeSelector: string,
): Promise<string | undefined> => {
  const dashboardRoot = document.querySelector(selector);
  if (!(dashboardRoot instanceof HTMLElement)) {
    console.warn("No dashboard root found", selector);
    return undefined;
  }

  const setup = setupDashboardForRendering(dashboardRoot, (root) =>
    root.querySelector<HTMLElement>(parametersNodeSelector),
  );
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
        fixParameterLegendOffsetForExport(parametersNode);
        node.insertBefore(parametersNode, node.firstChild);
      }
    },
  });

  return canvas.toDataURL("image/png").split(",")[1];
};

export const getChartSelector = (
  input: { dashcardId: number | undefined } | { cardId: number | undefined },
) => {
  if ("dashcardId" in input) {
    return `[data-dashcard-key='${input.dashcardId}']`;
  } else {
    return `[data-card-key='${getCardKey(input.cardId)}']`;
  }
};
