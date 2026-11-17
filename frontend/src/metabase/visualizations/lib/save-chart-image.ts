import EmbedFrameS from "metabase/embedding/theme.module.css";
import { isStorybookActive } from "metabase/env";
import { openImageBlobOnStorybook } from "metabase/utils/loki-utils";
import {
  canvasToBlob,
  resolveSvgVarPaint,
  restoreNestedSvgOverflow,
  runWithinExportGrant,
} from "metabase/viz-core";

import {
  createBrandingElement,
  getBrandingConfig,
  getBrandingSize,
} from "./exports-branding-utils";

export const SAVING_DOM_IMAGE_CLASS = "saving-dom-image";
export const SAVING_DOM_IMAGE_HIDDEN_CLASS = "saving-dom-image-hidden";

interface RenderOpts {
  selector: string;
  includeBranding: boolean;
}

type Opts = RenderOpts & {
  fileName: string;
};

const renderChartCanvas = async ({
  selector,
  includeBranding,
}: RenderOpts): Promise<HTMLCanvasElement | null> => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    return null;
  }

  const contentHeight = node.getBoundingClientRect().height;
  const contentWidth = node.getBoundingClientRect().width;

  const size = getBrandingSize(contentWidth);
  const brandingHeight = getBrandingConfig(size).h;
  const verticalOffset = includeBranding ? brandingHeight : 0;

  // Appending any element to the node does not automatically increase the canvas height.
  const canvasHeight = contentHeight + verticalOffset;

  // Ensure fonts are fully loaded before capturing, otherwise
  // html2canvas may render text with fallback fonts.
  await document.fonts.ready;

  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await runWithinExportGrant(() =>
    html2canvas(node, {
      scale: 2,
      useCORS: true,
      cspNonce: window.MetabaseNonce,
      height: canvasHeight,
      onclone: (_doc: Document, node: HTMLElement) => {
        node.classList.add(SAVING_DOM_IMAGE_CLASS);
        node.classList.add(EmbedFrameS.WithThemeBackground);

        node.style.borderRadius = "0px";
        node.style.border = "none";

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

        resolveSvgVarPaint(node);
        restoreNestedSvgOverflow(node);
      },
    }),
  );

  return canvas;
};

export const getChartImageBlob = async (
  opts: RenderOpts,
): Promise<Blob | null> => {
  const canvas = await renderChartCanvas(opts);
  if (!canvas) {
    return null;
  }
  return canvasToBlob(canvas);
};

export const saveChartImage = async ({ fileName, ...renderOpts }: Opts) => {
  const canvas = await renderChartCanvas(renderOpts);
  if (!canvas) {
    console.warn("No node found for selector", renderOpts.selector);
    return;
  }

  if (isStorybookActive) {
    // In storybook/loki we must wait for the blob and image to be ready
    // before the play function returns, otherwise the async callback may
    // be garbage-collected ("Promise was collected").
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve),
    );
    if (blob) {
      openImageBlobOnStorybook({ canvas, blob });
    }
  } else {
    canvas.toBlob((blob) => {
      if (blob) {
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.rel = "noopener";
        link.download = fileName;
        link.href = url;
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    });
  }
};
