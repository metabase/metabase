import { t } from "ttag";

import type { Dashboard } from "metabase-types/api";

import { SAVING_DOM_IMAGE_CLASS } from "./save-chart-image";
import _ from "underscore";

const TARGET_ASPECT_RATIO = 13 / 17;

interface DashCardBounds {
  top: number;
  bottom: number;
  height: number;
  allowedBreaks: Set<number>;
}

const getSortedDashCardBounds = (node: HTMLElement): DashCardBounds[] => {
  const dashCards = Array.from(node.querySelectorAll("[data-dashcard-key]"));
  const parentOffset = node.getBoundingClientRect().top;

  return dashCards
    .map(card => {
      const rect = card.getBoundingClientRect();

      // Table cards allow having page breaks
      const allowedBreaks = new Set(
        Array.from(card.querySelectorAll("[data-allow-page-break-after]"))
          .map(el => el.getBoundingClientRect().bottom - parentOffset)
          .filter(isFinite),
      );

      return {
        top: Math.round(rect.top - parentOffset),
        bottom: Math.round(rect.bottom - parentOffset),
        height: Math.round(rect.height),
        allowedBreaks,
      };
    })
    .sort((a, b) => a.top - b.top);
};

const findPageBreakCandidates = (
  cards: DashCardBounds[],
  offset = 0,
): number[] => {
  if (cards.length === 0) {
    return [];
  }

  const maxBottom = Math.max(...cards.map(card => card.bottom));

  const possibleBreaks = new Set(
    cards
      .filter(card => card.bottom < maxBottom)
      .flatMap(card => [card.bottom, ...card.allowedBreaks]),
  );

  for (const card of cards) {
    for (const breakCandidate of Array.from(possibleBreaks)) {
      const isWithinDashcard =
        breakCandidate > card.top && breakCandidate < card.bottom;
      const isAllowedBreak = card.allowedBreaks.has(breakCandidate);

      if (isWithinDashcard && !isAllowedBreak) {
        possibleBreaks.delete(breakCandidate);
      }
    }
  }

  const sortedBreaks = Array.from(possibleBreaks).sort((a, b) => a - b);
  return sortedBreaks.map(pageBreak => pageBreak + offset);
};

function getPageBreaks(
  sortedCards: DashCardBounds[],
  optimalPageHeight: number,
  totalHeight: number,
  offset = 0,
): number[] {
  if (sortedCards.length === 0) {
    return [];
  }

  const pageBreakCandidates = findPageBreakCandidates(sortedCards, offset);
  const canFitAllCardsInOnePage = optimalPageHeight >= totalHeight;

  if (pageBreakCandidates.length === 0 || canFitAllCardsInOnePage) {
    return [];
  }

  const minPageSize = optimalPageHeight * 0.7;
  const result: number[] = [];
  let currentPageStart = 0;
  let candidateIndex = 0;

  while (currentPageStart < totalHeight) {
    const targetBreakPoint = currentPageStart + optimalPageHeight;

    while (
      candidateIndex < pageBreakCandidates.length &&
      pageBreakCandidates[candidateIndex] <= currentPageStart + minPageSize
    ) {
      candidateIndex++;
    }

    if (candidateIndex >= pageBreakCandidates.length) {
      break;
    }

    let bestBreak = pageBreakCandidates[candidateIndex];

    if (candidateIndex + 1 < pageBreakCandidates.length) {
      const nextBreak = pageBreakCandidates[candidateIndex + 1];
      const currentDiff = Math.abs(targetBreakPoint - bestBreak);
      const nextDiff = Math.abs(targetBreakPoint - nextBreak);
      if (nextDiff < currentDiff) {
        bestBreak = nextBreak;
        candidateIndex++;
      }
    }

    result.push(bestBreak);
    currentPageStart = bestBreak;
  }

  return result;
}

const createHeaderElement = (dashboardName: string, marginBottom: number) => {
  const header = document.createElement("div");
  header.style.cssText = `
    font-family: "Lato", sans-serif;
    font-size: 24px;
    font-weight: 700;
    color: var(--mb-color-text-dark);
    border-bottom: 1px solid var(--mb-color-border);
    padding: 24px 16px 16px 16px;
    margin-bottom: ${marginBottom}px;
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
  const cardsBounds = getSortedDashCardBounds(node);

  const headerMarginBottom = 8;
  const pdfHeader = createHeaderElement(dashboardName, headerMarginBottom);

  node.appendChild(pdfHeader);
  const headerHeight =
    pdfHeader.getBoundingClientRect().height + headerMarginBottom;
  node.removeChild(pdfHeader);

  const { default: html2canvas } = await import("html2canvas-pro");
  const image = await html2canvas(node, {
    useCORS: true,
    onclone: (doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.insertBefore(pdfHeader, node.firstChild);
    },
  });

  const imageWidth = parseInt(image.getAttribute("width") ?? "0");
  const imageHeight = Math.max(...cardsBounds.map(card => card.bottom));

  const scale = window.devicePixelRatio || 1;
  const actualWidth = image.width / scale;

  const { default: jspdf } = await import("jspdf");

  const optimalPageHeight = Math.round(imageWidth * TARGET_ASPECT_RATIO);
  const pageBreaks = getPageBreaks(
    cardsBounds,
    optimalPageHeight,
    imageHeight,
    headerHeight,
  );

  const firstPageHeight = pageBreaks.length > 0 ? pageBreaks[0] : imageHeight;
  const pdf = new jspdf({
    unit: "px",
    hotfixes: ["px_scaling"],
    format: [actualWidth, firstPageHeight],
    orientation: "p",
  });

  pdf.addImage(image, "JPEG", 0, 0, actualWidth, imageHeight);

  pageBreaks.forEach((breakPoint, index) => {
    if (index < pageBreaks.length - 1) {
      const nextBreak = pageBreaks[index + 1];
      const pageHeight = nextBreak - breakPoint;

      pdf.addPage([actualWidth, pageHeight]);
      pdf.addImage(image, "JPEG", 0, -breakPoint, actualWidth, imageHeight);
    }
  });

  if (pageBreaks.length > 0) {
    const lastBreak = pageBreaks[pageBreaks.length - 1];
    const remainingHeight = imageHeight - lastBreak;

    if (remainingHeight > 0) {
      pdf.addPage([actualWidth, remainingHeight]);
      pdf.addImage(image, "JPEG", 0, -lastBreak, actualWidth, imageHeight);
    }
  }

  pdf.save(fileName);
};

export const getExportTabAsPdfButtonText = (tabs: Dashboard["tabs"]) => {
  return Array.isArray(tabs) && tabs.length > 1
    ? t`Export tab as PDF`
    : t`Export as PDF`;
};
