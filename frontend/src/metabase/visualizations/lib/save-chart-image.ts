import { css } from "@emotion/react";
import html2canvas from "html2canvas";
import html2pdf from "html2pdf.js";

import { color } from "metabase/lib/colors";

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

  const canvas = await html2canvas(node, {
    useCORS: true,
  });

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

export const saveDashboardPdf = async (selector: string, fileName: string) => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  node.classList.add(SAVING_CHART_IMAGE_CLASS);

  const rect = node.getBoundingClientRect();

  await html2pdf(node, {
    margin: 1,
    filename: fileName,
    jsPDF: {
      unit: "px",
      hotfixes: ["px_scaling"],
      format: [rect.width + 20, rect.height + 40],
    },
    html2canvas: {
      useCORS: true,
      onclone: (doc, node) => {
        const style = doc.createElement("style");
        style.innerHTML = `
          .DashCard .Card {
            box-shadow: none; 
            border: 1px solid ${color("border")}
          }`;

        doc.body.appendChild(style);
        node.style.paddingBottom = "20px";
      },
    },
  });

  node.classList.remove(SAVING_CHART_IMAGE_CLASS);

  // const link = document.createElement("a");

  // link.setAttribute("download", fileName);
  // link.setAttribute(
  //   "href",
  //   canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"),
  // );

  // link.click();
  // link.remove();
};
