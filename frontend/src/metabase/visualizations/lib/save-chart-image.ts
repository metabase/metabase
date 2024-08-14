import { css } from "@emotion/react";

export const SAVING_DOM_IMAGE_CLASS = "saving-dom-image";
export const SAVING_DOM_IMAGE_HIDDEN_CLASS = "saving-dom-image-hidden";

export const saveDomImageStyles = css`
  .${SAVING_DOM_IMAGE_CLASS} {
    .${SAVING_DOM_IMAGE_HIDDEN_CLASS} {
      visibility: hidden;
    }
  }
`;

export const saveChartImage = async (selector: string, fileName: string) => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  node.classList.add(SAVING_DOM_IMAGE_CLASS);

  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
  });

  node.classList.remove(SAVING_DOM_IMAGE_CLASS);

  canvas.toBlob(blob => {
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
};
