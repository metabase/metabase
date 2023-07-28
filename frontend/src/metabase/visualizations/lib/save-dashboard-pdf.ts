import html2canvas from "html2canvas";
import jspdf from "jspdf";

import { color } from "metabase/lib/colors";

import { SAVING_DOM_IMAGE_CLASS } from "./save-chart-image";

export const saveDashboardPdf = async (
  selector: string,
  dashboardName: string,
) => {
  const fileName = `${dashboardName}.pdf`;
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  const image = await html2canvas(node, {
    useCORS: true,
    onclone: (doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
    },
  });

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

  pdf.addImage(image, "JPEG", 0, 60, imageWidth, imageHeight, "", "FAST", 0);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(color("text-dark"));
  pdf.text(dashboardName, 32, 40);
  pdf.setDrawColor(color("border"));
  pdf.line(32, 52, imageWidth - 32, 52, "S");

  pdf.save(fileName);
};
