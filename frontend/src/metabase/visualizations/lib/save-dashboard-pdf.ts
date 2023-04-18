import html2canvas from "html2canvas";
import jspdf from "jspdf";

import { color } from "metabase/lib/colors";

import { SAVING_CHART_IMAGE_CLASS } from "./save-chart-image";

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

  node.classList.add(SAVING_CHART_IMAGE_CLASS);

  const canvas = await html2canvas(node, {
    useCORS: true,
    removeContainer: false,
    onclone: (doc: Document, node: HTMLElement) => {
      const style = doc.createElement("style");
      style.innerHTML = `
          .DashCard .Card {
            box-shadow: none;
            border: 1px solid ${color("border")};
          }`;

      doc.body.appendChild(style);
      node.style.paddingBottom = "20px";

      //This needs to be done manually due to how html2canvas treats styles in SVGs
      const textNodes = doc.querySelectorAll(
        ".Card text, .Card tspan",
      ) as NodeListOf<HTMLElement>;

      textNodes.forEach(element => {
        element.style.fontWeight = "600";
      });
    },
  });

  node.classList.remove(SAVING_CHART_IMAGE_CLASS);

  const canvasHeight = parseInt(canvas.getAttribute("height") ?? "0");
  const canvasWidth = parseInt(canvas.getAttribute("width") ?? "0");

  const pdf = new jspdf({
    unit: "px",
    hotfixes: ["px_scaling"],
    format: [canvasWidth, canvasHeight + 50],
  });

  pdf.addImage(canvas, "JPEG", 0, 0, canvasWidth, canvasHeight, "", "FAST", 0);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(color("text-dark"));
  pdf.text(dashboardName, 32, 40);
  pdf.setDrawColor(color("border"));
  pdf.line(32, 52, canvasWidth - 32, 52, "S");

  pdf.save(fileName);
};
