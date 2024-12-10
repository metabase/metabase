import { t } from "ttag";

import type { Dashboard } from "metabase-types/api";

import { SAVING_DOM_IMAGE_CLASS } from "./save-chart-image";

const TARGET_ASPECT_RATIO = 22 / 17;

interface DashCardBounds {
  top: number;
  bottom: number;
  height: number;
}

const getSortedDashCardBounds = (node: HTMLElement): DashCardBounds[] => {
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

function findPossiblePageBreaks(
  sortedCards: DashCardBounds[],
  optimalPageHeight: number,
): number[] {
  if (sortedCards.length === 0) {
    return [];
  }

  const maxBottom = Math.max(...sortedCards.map(card => card.bottom));

  const breakCandidates = new Set<number>();

  sortedCards.forEach(card => breakCandidates.add(card.bottom));

  for (let i = 0; i < sortedCards.length - 1; i++) {
    const currentBottom = Math.max(
      ...sortedCards.slice(0, i + 1).map(card => card.bottom),
    );
    const nextTop = sortedCards[i + 1].top;

    if (nextTop > currentBottom) {
      breakCandidates.add(currentBottom);
    }
  }

  const sortedBreakPoints = Array.from(breakCandidates).sort((a, b) => a - b);

  if (sortedBreakPoints.length === 0) {
    return [];
  }

  const result: number[] = [];
  let currentPosition = 0;
  let bestNextBreak = sortedBreakPoints[0];

  while (currentPosition < maxBottom) {
    let bestDiff = Infinity;

    for (const breakPoint of sortedBreakPoints) {
      if (breakPoint <= currentPosition) {
        continue;
      }

      const pageHeight = breakPoint - currentPosition;
      const diff = Math.abs(pageHeight - optimalPageHeight);

      if (diff < bestDiff) {
        bestDiff = diff;
        bestNextBreak = breakPoint;
      }

      if (pageHeight > optimalPageHeight * 2) {
        break;
      }
    }

    if (bestNextBreak > currentPosition) {
      result.push(bestNextBreak);
      currentPosition = bestNextBreak;
    } else {
      break;
    }
  }

  if (result.length > 0 && result[result.length - 1] === maxBottom) {
    result.pop();
  }

  return result;
}

const canvasToBlob = (canvas: any) => {
  canvas.toBlob(blob => {
    if (blob) {
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.rel = "noopener";
      link.download = "test.png";
      link.href = url;
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  });
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

  const originalCardBounds = getSortedDashCardBounds(node);

  // const tempHeader = createHeaderElement(dashboardName);
  // document.body.appendChild(tempHeader);
  // const headerHeight = tempHeader.getBoundingClientRect().height;
  // document.body.removeChild(tempHeader);

  const headerHeight = 0;

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
    },
  });

  const imageWidth = parseInt(image.getAttribute("width") ?? "0");
  const maxBottom = Math.max(...adjustedCardBounds.map(card => card.bottom));
  const scale = window.devicePixelRatio || 1;
  const actualWidth = image.width / scale;

  const targetPageHeight = Math.round(imageWidth * TARGET_ASPECT_RATIO);
  const { default: jspdf } = await import("jspdf");

  const pageBreaks = findPossiblePageBreaks(
    adjustedCardBounds,
    targetPageHeight,
  );

  const firstPageHeight = pageBreaks.length > 0 ? pageBreaks[0] : maxBottom;
  const pdf = new jspdf({
    unit: "px",
    hotfixes: ["px_scaling"],
    format: [actualWidth, firstPageHeight],
    orientation: "p",
  });

  pdf.addImage(image, "JPEG", 0, 0, actualWidth, maxBottom);

  pageBreaks.forEach((breakPoint, index) => {
    if (index < pageBreaks.length - 1) {
      const nextBreak = pageBreaks[index + 1];
      const pageHeight = nextBreak - breakPoint;

      pdf.addPage([actualWidth, pageHeight]);
      pdf.addImage(image, "JPEG", 0, -breakPoint, actualWidth, maxBottom);
    }
  });

  if (pageBreaks.length > 0) {
    const lastBreak = pageBreaks[pageBreaks.length - 1];
    const remainingHeight = maxBottom - lastBreak;

    if (remainingHeight > 0) {
      pdf.addPage([actualWidth, remainingHeight]);
      pdf.addImage(image, "JPEG", 0, -lastBreak, actualWidth, maxBottom);
    }
  }

  pdf.save(fileName);
};

export const getExportTabAsPdfButtonText = (tabs: Dashboard["tabs"]) => {
  return Array.isArray(tabs) && tabs.length > 1
    ? t`Export tab as PDF`
    : t`Export as PDF`;
};
