import { css } from "@emotion/react";
import html2canvas from "html2canvas";

export const SAVING_CHART_IMAGE_CLASS = "saving-chart-image";
export const SAVING_CHART_IMAGE_HIDDEN_CLASS = "saving-chart-image-hidden";

export const saveChartImageStyles = css`
  .${SAVING_CHART_IMAGE_CLASS} {
    .${SAVING_CHART_IMAGE_HIDDEN_CLASS} {
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

  node.classList.add(SAVING_CHART_IMAGE_CLASS);

  const canvas = await html2canvas(node);

  node.classList.remove(SAVING_CHART_IMAGE_CLASS);

  const link = document.createElement("a");

  link.setAttribute("download", fileName);
  link.setAttribute(
    "href",
    canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"),
  );

  link.click();
  link.remove();
};
