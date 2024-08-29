import { css } from "@emotion/react";

import { isStorybookActive } from "metabase/env";
import { openImageBlobOnStorybook } from "metabase/lib/loki-utils";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

export const SAVING_DOM_IMAGE_CLASS = "saving-dom-image";
export const SAVING_DOM_IMAGE_HIDDEN_CLASS = "saving-dom-image-hidden";
export const SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS =
  "saving-dom-image-display-none";

export const saveDomImageStyles = css`
  .${SAVING_DOM_IMAGE_CLASS} {
    .${SAVING_DOM_IMAGE_HIDDEN_CLASS} {
      visibility: hidden;
    }
    .${SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS} {
      display: none;
    }
  }
`;

export const saveChartImage = async (selector: string, fileName: string) => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    onclone: (doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.classList.add(EmbedFrameS.WithThemeBackground);

      node.style.borderRadius = "0px";
      node.style.border = "none";
    },
  });

  canvas.toBlob(blob => {
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
