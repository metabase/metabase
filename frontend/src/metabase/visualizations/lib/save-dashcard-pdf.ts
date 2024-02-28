import html2canvas from "html2canvas";
import jspdf from "jspdf";

import { SAVING_DOM_IMAGE_CLASS } from "./save-chart-image";

export const saveDashcardPdf = async (
  selector: string,
  dashcardName: string,
) => {
  const fileName = `${dashcardName}.pdf`;
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  node.classList.add(SAVING_DOM_IMAGE_CLASS);
  const image = await html2canvas(node, { useCORS: true });
  node.classList.remove(SAVING_DOM_IMAGE_CLASS);

  const imageHeight = parseInt(image.getAttribute("height") ?? "0");
  const imageWidth = parseInt(image.getAttribute("width") ?? "0");

  const pdfWidth = imageWidth;
  const pdfHeight = imageHeight + 80;

  const pdf = new jspdf({
    unit: "px",
    hotfixes: ["px_scaling"],
    format: [pdfWidth, pdfHeight],
    orientation: pdfWidth > pdfHeight ? "l" : "p",
  });

  pdf.addImage(image, "PNG", 0, 40, imageWidth, imageHeight, "", "NONE", 0);

  pdf.save(fileName);
};
