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
}

export const saveChartImage = async ({
  selector,
  fileName,
  includeBranding,
}: Opts) => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  const contentHeight = node.getBoundingClientRect().height;
  const contentWidth = node.getBoundingClientRect().width;

  const size = getBrandingSize(contentWidth);
  const brandingHeight = getBrandingConfig(size).h;
  const verticalOffset = includeBranding ? brandingHeight : 0;

  // Appending any element to the node does not automatically increase the canvas height.
  const canvasHeight = contentHeight + verticalOffset;

  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
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
