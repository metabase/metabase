import Color from "color";
import { t } from "ttag";

import { DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/dashboard/constants";
import type { Dashboard } from "metabase-types/api";

import {
  createBrandingElement,
  getBrandingConfig,
  getBrandingSize,
} from "./exports-branding-utils";
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
    .map((card) => {
      const rect = card.getBoundingClientRect();

      // Table cards allow having page breaks
      const allowedBreaks = new Set(
        Array.from(card.querySelectorAll("[data-allow-page-break-after]"))
          .map((el) => el.getBoundingClientRect().bottom - parentOffset)
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

  const maxBottom = Math.max(...cards.map((card) => card.bottom));

  const possibleBreaks = new Set(
    cards
      .filter((card) => card.bottom < maxBottom)
      .flatMap((card) => [card.bottom, ...card.allowedBreaks]),
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
  return sortedBreaks.map((pageBreak) => pageBreak + offset);
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

interface SavePdfProps {
  selector: string;
  dashboardName: string;
  includeBranding: boolean;
}

async function isValidColor(str: string) {
  const { default: jspdf } = await import("jspdf");
  const pdf = new jspdf();
  try {
    pdf.setFillColor(str);
    return true;
  } catch {
    console.warn(`Unsupported color string: "${str}"`);
    return false;
  }
}

export const saveDashboardPdf = async ({
  selector,
  dashboardName,
  includeBranding,
}: SavePdfProps) => {
  const originalFileName = `${dashboardName}.pdf`;
  const fileName = includeBranding
    ? // eslint-disable-next-line no-literal-metabase-strings -- Used explicitly in non-whitelabeled instances
      `Metabase - ${originalFileName}`
    : originalFileName;

  const dashboardRoot = document.querySelector(selector);
  const gridNode = dashboardRoot?.querySelector(".react-grid-layout");

  if (!gridNode || !(gridNode instanceof HTMLElement)) {
    console.warn("No dashboard content found", selector);
    return;
  }
  const cardsBounds = getSortedDashCardBounds(gridNode);

  const pdfHeader = createHeaderElement(dashboardName, HEADER_MARGIN_BOTTOM);
  const parametersNode = dashboardRoot
    ?.querySelector(`#${DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID}`)
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

  const contentWidth = gridNode.offsetWidth;
  const width = contentWidth + PAGE_PADDING * 2;

  const size = getBrandingSize(width);
  const brandingHeight = getBrandingConfig(size).h;
  const verticalOffset =
    headerHeight + parametersHeight + (includeBranding ? brandingHeight : 0);
  const contentHeight = gridNode.offsetHeight + verticalOffset;

  let backgroundColor = Color(
    getComputedStyle(document.documentElement)
      .getPropertyValue("--mb-color-bg-dashboard")
      .trim(),
  ).hex();

  if (!(await isValidColor(backgroundColor))) {
    backgroundColor = "white"; // Fallback to white if the color is invalid
  }

  const { default: html2canvas } = await import("html2canvas-pro");
  const image = await html2canvas(gridNode, {
    height: contentHeight,
    width: contentWidth,
    useCORS: true,
    backgroundColor,
    scale: window.devicePixelRatio || 1,
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.style.height = `${contentHeight}px`;
      node.style.backgroundColor = backgroundColor;

      // Fix gauge chart text sizing in PDF exports
      // Problem: Gauge charts use SVG with a viewBox coordinate system.
      // When the browser scales the viewBox to fit the pixel width, text gets
      // magnified. html2canvas then captures this magnified text, making it
      // look too large in the PDF. We fix this in two steps:
      try {
        const svgs = Array.from(node.querySelectorAll("svg"));
        svgs.forEach((svg) => {
          const textNodes = Array.from(
            svg.querySelectorAll("text"),
          ) as SVGTextElement[];

          // Step 1: Compute how much the browser scaled the SVG
          // Example: If viewBox width is 203px but SVG renders at 519px,
          // the scale factor is 519/203 = 2.55x
          const vb = (svg as SVGSVGElement).viewBox?.baseVal;
          const clientW =
            (svg as SVGSVGElement).clientWidth ||
            ((svg as any).width?.baseVal?.value as number | undefined) ||
            0;
          const scale =
            vb && vb.width > 0 && clientW > 0 ? clientW / vb.width : 1;

          // Step 2: Reverse the scaling on all text elements
          // If text was scaled 2.55x by the browser, divide its size by 2.55
          // to get back to the original intended size
          if (scale !== 1 && scale > 0) {
            textNodes.forEach((t) => {
              const currentSize = parseFloat(
                getComputedStyle(t).fontSize || "0",
              );
              if (currentSize > 0) {
                t.style.fontSize = `${currentSize / scale}px`;
              }
            });
          }

          // Step 3: Special handling for gauge charts
          // Gauge charts have a large center value (the main number) and smaller
          // tick labels around the arc. After de-scaling, these might be too small
          // or have the wrong size ratio. We detect gauge charts by looking for:
          // - Bold text with middle anchor (the center value)
          // - Other text elements (the tick labels)
          const centerTexts = textNodes.filter((t) => {
            const cs = getComputedStyle(t);
            const isBold = parseInt(cs.fontWeight || "400", 10) >= 700;
            // Check both attribute and computed style for text-anchor
            // because different browsers/implementations may set it differently
            const isMiddle =
              t.getAttribute("text-anchor") === "middle" ||
              (cs as any).textAnchor === "middle";
            return isBold && isMiddle;
          });

          const otherTexts = textNodes.filter((t) => !centerTexts.includes(t));

          // Only proceed if we found both center and tick labels (confirms it's a gauge)
          if (centerTexts.length > 0 && otherTexts.length > 0) {
            const getSize = (t: SVGTextElement) =>
              parseFloat(getComputedStyle(t).fontSize || "0");

            const centerSizes = centerTexts.map(getSize).filter((n) => n > 0);
            const otherSizes = otherTexts.map(getSize).filter((n) => n > 0);

            if (centerSizes.length > 0 && otherSizes.length > 0) {
              // Calculate average sizes after de-scaling
              const avgCenter =
                centerSizes.reduce((a, b) => a + b, 0) / centerSizes.length;
              const avgOther =
                otherSizes.reduce((a, b) => a + b, 0) / otherSizes.length;
              const currentRatio = avgCenter / avgOther;

              // Decide if we need to fix the sizing:
              // - Ratio < 2.0: Center and ticks are too similar in size
              // - avgOther < 3: Tick labels are too small to read
              // - avgCenter < 6: Center value is too small to read
              const needsScaling =
                currentRatio < 2.0 || avgOther < 3 || avgCenter < 6;

              if (needsScaling) {
                // Set absolute target sizes based on gauge design spec:
                // Center should be 0.7em = 11.2px (assuming 16px base)
                // Ticks should be 0.28em = 4.48px
                // This gives us a 2.5:1 ratio which is visually correct
                const targetCenterSize = 11.2;
                const targetTickSize = 4.48;

                centerTexts.forEach((t) => {
                  t.style.fontSize = `${targetCenterSize}px`;
                });

                otherTexts.forEach((t) => {
                  t.style.fontSize = `${targetTickSize}px`;
                });
              }
            }
          }
        });
      } catch {
        // If anything fails, silently continue - better to have
        // slightly wrong text sizing than to break the entire PDF export
      }

      // Handle all dashboard card containers and their children
      const dashboardCards = node.querySelectorAll("[data-dashcard-key]");
      dashboardCards.forEach((card) => {
        if (card instanceof HTMLElement) {
          // Set background color for the card container
          card.style.backgroundColor = backgroundColor;

          // Remove any box shadows that might cause grey borders
          card.style.boxShadow = "none";

          // Set a clean border if needed
          card.style.border = "1px solid var(--mb-color-border)";
        }
      });

      if (parametersNode instanceof HTMLElement) {
        node.insertBefore(parametersNode, node.firstChild);
      }
      node.insertBefore(pdfHeader, node.firstChild);

      if (includeBranding) {
        const branding = createBrandingElement(size);
        node.insertBefore(branding, node.firstChild);
      }
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
    const isFirstPage = index === 0;
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

      if (isFirstPage && includeBranding) {
        const url =
          "https://www.metabase.com?utm_source=product&utm_medium=export&utm_campaign=exports_branding&utm_content=pdf_export";

        pdf.link(PAGE_PADDING, PAGE_PADDING, contentWidth, brandingHeight, {
          url,
        });
      }
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
