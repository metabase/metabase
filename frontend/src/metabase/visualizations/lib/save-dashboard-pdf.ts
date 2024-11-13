import { t } from "ttag";

import type { Dashboard } from "metabase-types/api";

import { SAVING_DOM_IMAGE_CLASS } from "./save-chart-image";

const A4_ASPECT_RATIO = 1.414;

interface DashCardBounds {
  top: number;
  bottom: number;
  height: number;
}

const getDashCardBounds = (node: HTMLElement): DashCardBounds[] => {
  const dashCards = Array.from(node.querySelectorAll("[data-dashcard-key]"));
  const containerRect = node.getBoundingClientRect();

  return dashCards
    .map(card => {
      const rect = (card as HTMLElement).getBoundingClientRect();
      return {
        top: Math.round(rect.top - containerRect.top),
        bottom: Math.round(rect.bottom - containerRect.top),
        height: Math.round(rect.height),
      };
    })
    .sort((a, b) => a.top - b.top);
};

const calculatePageBreaks = (
  cardBounds: DashCardBounds[],
  totalHeight: number,
  pageHeight: number,
): number[] => {
  if (!cardBounds.length) {
    return [totalHeight];
  }

  const pageBreaks: number[] = [];
  let currentHeight = 0;

  while (currentHeight < totalHeight) {
    const targetBreak = currentHeight + pageHeight;

    const splitCardIndex = cardBounds.findIndex(
      card => card.top < targetBreak && card.bottom > targetBreak,
    );

    if (splitCardIndex >= 0) {
      pageBreaks.push(cardBounds[splitCardIndex].top);
      currentHeight = cardBounds[splitCardIndex].top;
    } else {
      const lastFittingCard = [...cardBounds]
        .reverse()
        .find(
          card => card.bottom <= targetBreak && card.bottom > currentHeight,
        );

      if (lastFittingCard) {
        pageBreaks.push(lastFittingCard.bottom);
        currentHeight = lastFittingCard.bottom;
      } else {
        pageBreaks.push(targetBreak);
        currentHeight = targetBreak;
      }
    }
  }

  // Ensure we include the total height
  if (pageBreaks[pageBreaks.length - 1] < totalHeight) {
    pageBreaks.push(totalHeight);
  }

  return pageBreaks;
};

const createHeaderElement = (dashboardName: string) => {
  const header = document.createElement("div");
  header.style.cssText = `
    font-family: "Lato", sans-serif;
    font-size: 24px;
    font-weight: 700;
    color: var(--mb-color-text-dark);
    border-bottom: 1px solid var(--mb-color-border);
    padding: 32px 16px 16px 16px;
    margin-bottom: 16px;
  `;
  header.textContent = dashboardName;
  return header;
};

export const saveDashboardPdf = async (
  selector: string,
  dashboardName: string,
) => {
  const fileName = `${dashboardName}.pdf`;
  const node = document
    .querySelector(selector)
    ?.querySelector(".react-grid-layout");

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No dashboard content found", selector);
    return;
  }

  const originalCardBounds = getDashCardBounds(node);

  const tempHeader = createHeaderElement(dashboardName);
  document.body.appendChild(tempHeader);
  const headerHeight = tempHeader.getBoundingClientRect().height;
  document.body.removeChild(tempHeader);

  const adjustedCardBounds = originalCardBounds.map(bound => ({
    ...bound,
    top: bound.top + headerHeight,
    bottom: bound.bottom + headerHeight,
  }));

  const { default: html2canvas } = await import("html2canvas-pro");
  const image = await html2canvas(node, {
    useCORS: true,
    onclone: (doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      const title = createHeaderElement(dashboardName);
      node.insertBefore(title, node.firstChild);
    },
  });

  const imageHeight = parseInt(image.getAttribute("height") ?? "0");
  const imageWidth = parseInt(image.getAttribute("width") ?? "0");

  const targetPageHeight = Math.round(imageWidth * A4_ASPECT_RATIO);

  const { default: jspdf } = await import("jspdf");
  const pageBreaks = calculatePageBreaks(
    adjustedCardBounds,
    imageHeight,
    targetPageHeight,
  );

  console.log(">>>pageBreaks", pageBreaks);

  const pdf = new jspdf({
    unit: "px",
    hotfixes: ["px_scaling"],
    format: [imageWidth, targetPageHeight],
    orientation: "p",
  });

  const pageHeights = pageBreaks.map((breakPoint, index) => {
    const previousBreak = index > 0 ? pageBreaks[index - 1] : 0;
    return breakPoint - previousBreak;
  });

  console.log(">>>pageHeights", pageHeights);

  pageBreaks.forEach((breakPoint, index) => {
    const previousBreak = index > 0 ? pageBreaks[index - 1] : 0;

    pdf.addImage(
      image,
      "JPEG",
      0,
      -previousBreak,
      imageWidth,
      imageHeight,
      "",
      "FAST",
      0,
    );

    if (index < pageBreaks.length - 1) {
      // Use the pre-calculated height for the next page
      pdf.addPage([
        imageWidth,
        Math.min(targetPageHeight, pageHeights[index + 1]),
      ]);
    }
  });

  pdf.save(fileName);
};

export const getExportTabAsPdfButtonText = (tabs: Dashboard["tabs"]) => {
  return Array.isArray(tabs) && tabs.length > 1
    ? t`Export tab as PDF`
    : t`Export as PDF`;
};
