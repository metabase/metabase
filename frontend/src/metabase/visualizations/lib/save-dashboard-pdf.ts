import { t } from "ttag";

import type { Dashboard } from "metabase-types/api";

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

  const { default: html2canvas } = await import("html2canvas-pro");
  const image = await html2canvas(node, {
    useCORS: true,
    onclone: (doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      const title = doc.createElement("h2") as HTMLElement;
      title.innerHTML = dashboardName;
      title.style["borderBottom"] = "1px solid var(--mb-color-border)";
      title.style["padding"] = "2rem 1rem 1rem 1rem";
      node.insertBefore(title, node.firstChild);
    },
  });

  const imageHeight = parseInt(image.getAttribute("height") ?? "0");
  const imageWidth = parseInt(image.getAttribute("width") ?? "0");

  const pdfWidth = imageWidth;
  const pdfHeight = imageHeight + 80;

  const { default: jspdf } = await import("jspdf");
  const pdf = new jspdf({
    unit: "px",
    hotfixes: ["px_scaling"],
    format: [pdfWidth, pdfHeight],
    orientation: pdfWidth > pdfHeight ? "l" : "p",
  });

  pdf.addImage(image, "JPEG", 0, 0, imageWidth, imageHeight, "", "FAST", 0);

  pdf.save(fileName);
};

export const getExportTabAsPdfButtonText = (tabs: Dashboard["tabs"]) => {
  return Array.isArray(tabs) && tabs.length > 1
    ? t`Export tab as PDF`
    : t`Export as PDF`;
};
