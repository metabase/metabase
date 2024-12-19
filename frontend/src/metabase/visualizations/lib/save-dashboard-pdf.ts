import { t } from "ttag";
import _ from "underscore";

import { DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/dashboard/constants";
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
  minPageHeight: number,
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

  const result: number[] = [];
  let currentPageStart = 0;
  let candidateIndex = 0;

  while (currentPageStart < totalHeight) {
    const targetBreakPoint = currentPageStart + optimalPageHeight;

    while (
      candidateIndex < pageBreakCandidates.length &&
      pageBreakCandidates[candidateIndex] <= currentPageStart + minPageHeight
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

const HEADER_MARGIN_BOTTOM = 12;
const PARAMETERS_MARGIN_BOTTOM = 12;
const PAGE_PADDING = 16;

export const saveDashboardPdf = async (
  selector: string,
  dashboardName: string,
) => {
  const fileName = `${dashboardName}.pdf`;
  const dashboardRoot = document.querySelector(selector);
  const gridNode = dashboardRoot?.querySelector(".react-grid-layout");

  if (!gridNode || !(gridNode instanceof HTMLElement)) {
    console.warn("No dashboard content found", selector);
    return;
  }
  const cardsBounds = getSortedDashCardBounds(gridNode);

  const pdfHeader = createHeaderElement(dashboardName, HEADER_MARGIN_BOTTOM);
  const parametersNode = dashboardRoot
    ?.querySelector(`#${DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID}`)
    ?.cloneNode(true);

  let parametersHeight = 0;
  if (parametersNode instanceof HTMLElement) {
    gridNode.append(parametersNode);
    parametersNode.style.cssText = `margin-bottom: ${PARAMETERS_MARGIN_BOTTOM}px`;
    parametersHeight =
      parametersNode.getBoundingClientRect().height + PARAMETERS_MARGIN_BOTTOM;
    gridNode.removeChild(parametersNode);
  }

  gridNode.appendChild(pdfHeader);
  const headerHeight =
    pdfHeader.getBoundingClientRect().height + HEADER_MARGIN_BOTTOM;
  gridNode.removeChild(pdfHeader);

  const verticalOffset = headerHeight + parametersHeight;
  const contentWidth = gridNode.offsetWidth;
  const contentHeight = gridNode.offsetHeight + verticalOffset;
  const width = contentWidth + PAGE_PADDING * 2;

  const backgroundColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--mb-color-bg-dashboard")
    .trim();

  const { default: html2canvas } = await import("html2canvas-pro");
  const image = await html2canvas(gridNode, {
    height: contentHeight,
    width: contentWidth,
    useCORS: true,
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.style.height = `${contentHeight}px`;
      node.style.backgroundColor = backgroundColor;
      if (parametersNode instanceof HTMLElement) {
        node.insertBefore(parametersNode, node.firstChild);
      }
      node.insertBefore(pdfHeader, node.firstChild);
    },
  });

  const { default: jspdf } = await import("jspdf");

  // Page page height cannot be smaller than page width otherwise the content will be cut off
  // or the page should have a landscape orientation.
  const minPageHeight = contentWidth;
  const optimalPageHeight = Math.round(width * TARGET_ASPECT_RATIO);
  const pageBreaks = getPageBreaks(
    cardsBounds,
    optimalPageHeight - PAGE_PADDING * 2,
    contentHeight,
    minPageHeight,
    verticalOffset,
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
