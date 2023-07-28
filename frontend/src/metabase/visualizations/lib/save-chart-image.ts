import { css } from "@emotion/react";
import html2canvas from "html2canvas";

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

  const canvas = await html2canvas(node, {
    useCORS: true,
  });

  node.classList.remove(SAVING_DOM_IMAGE_CLASS);

  const link = document.createElement("a");

  link.setAttribute("download", fileName);
  link.setAttribute(
    "href",
    canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"),
  );

  link.click();
  link.remove();
};
