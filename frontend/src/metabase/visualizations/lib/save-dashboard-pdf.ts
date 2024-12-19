import { t } from "ttag";
import _ from "underscore";

import type { Dashboard } from "metabase-types/api";

import { SAVING_DOM_IMAGE_CLASS } from "./save-chart-image";

const TARGET_ASPECT_RATIO = 21 / 17;

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

export const findPageBreakCandidates = (
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

export const getPageBreaks = (
  sortedCards: DashCardBounds[],
  optimalPageHeight: number,
  totalHeight: number,
  offset = 0,
): number[] => {
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
};

const createHeaderElement = (dashboardName: string, marginBottom: number) => {
  const header = document.createElement("div");
  header.style.cssText = `
    font-family: "Lato", sans-serif;
    font-size: 24px;
    font-weight: 700;
    color: var(--mb-color-text-primary);
    border-bottom: 1px solid var(--mb-color-border);
    padding: 24px 16px 16px 16px;
    margin-bottom: ${marginBottom}px;
  `;
  header.textContent = dashboardName;
  return header;
};

const HEADER_MARGIN_BOTTOM = 8;
const PAGE_PADDING = 16;

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

  const pdfHeader = createHeaderElement(dashboardName, HEADER_MARGIN_BOTTOM);

  node.appendChild(pdfHeader);
  const headerHeight =
    pdfHeader.getBoundingClientRect().height + HEADER_MARGIN_BOTTOM;
  node.removeChild(pdfHeader);

  const contentWidth = node.offsetWidth;
  const contentHeight = node.offsetHeight + headerHeight;
  const width = contentWidth + PAGE_PADDING * 2;

  const backgroundColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--mb-color-bg-dashboard")
    .trim();

  const { default: html2canvas } = await import("html2canvas-pro");
  const image = await html2canvas(node, {
    height: contentHeight,
    width: contentWidth,
    useCORS: true,
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.style.height = `${contentHeight}px`;
      node.style.backgroundColor = backgroundColor;
      node.insertBefore(pdfHeader, node.firstChild);
    },
  });

  const { default: jspdf } = await import("jspdf");

  const optimalPageHeight = Math.round(width * TARGET_ASPECT_RATIO);
  const pageBreaks = getPageBreaks(
    cardsBounds,
    optimalPageHeight - PAGE_PADDING * 2,
    contentHeight,
    headerHeight,
  );

  const pdf = new jspdf({
    unit: "px",
    hotfixes: ["px_scaling"],
  });

  // Remove initial empty page
  pdf.deletePage(1);

  const scale = window.devicePixelRatio || 1;

  const pageEnds = [...pageBreaks, contentHeight];
  let prevBreak = 0;

  pageEnds.forEach((pageBreak, index) => {
    const isLastPage = index === pageEnds.length - 1;
    const pageBreaksDiff = pageBreak - prevBreak;

    // Special case for the last page: if it is too short expand its height
    // to optimalPageHeight to avoid its being trimmed horizontally
    const pageHeight = !isLastPage
      ? pageBreaksDiff + PAGE_PADDING * 2
      : Math.max(pageBreaksDiff + PAGE_PADDING * 2, optimalPageHeight);

    pdf.addPage([width, pageHeight]);

    // Add background color to the page
    pdf.setFillColor(backgroundColor);
    pdf.rect(0, 0, width, pageHeight, "F");

    // Calculate the source and destination dimensions for this page slice
    const sourceY = prevBreak;
    const sourceHeight = pageBreaksDiff;

    // Single page canvas
    const pageCanvas = document.createElement("canvas");

    pageCanvas.width = contentWidth * scale;
    pageCanvas.height = sourceHeight * scale;
    const ctx = pageCanvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(
        image,
        0,
        sourceY * scale,
        contentWidth * scale,
        sourceHeight * scale,
        0,
        0,
        contentWidth * scale,
        sourceHeight * scale,
      );

      pdf.addImage(
        pageCanvas,
        "JPEG",
        PAGE_PADDING,
        PAGE_PADDING,
        contentWidth,
        sourceHeight,
      );
    }

    prevBreak = pageBreak;
  });

  pdf.save(fileName);
};

export const getExportTabAsPdfButtonText = (tabs: Dashboard["tabs"]) => {
  return Array.isArray(tabs) && tabs.length > 1
    ? t`Export tab as PDF`
    : t`Export as PDF`;
};
