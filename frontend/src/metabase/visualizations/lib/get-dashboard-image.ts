import { DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/dashboard/constants";

import { SAVING_DOM_IMAGE_CLASS } from "./image-exports";
const PARAMETERS_MARGIN_BOTTOM = 12;

export const getChartImage = async (
  selector: string,
): Promise<File | undefined> => {
  const chartRoot = document.querySelector(selector) as HTMLElement;

  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(chartRoot, {
    useCORS: true,
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
    },
  });

  return new Promise<File | undefined>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "chart.png", { type: "image/png" });
        resolve(file);
      } else {
        resolve(undefined);
      }
    }, "image/png");
  });
};

export const getDashboardImage = async (
  selector: string,
): Promise<File | undefined> => {
  const dashboardRoot = document.querySelector(selector);
  const gridNode = dashboardRoot?.querySelector(".react-grid-layout");

  if (!gridNode || !(gridNode instanceof HTMLElement)) {
    console.warn("No dashboard content found", selector);
    return undefined as any;
  }

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

  const verticalOffset = parametersHeight;
  const contentWidth = gridNode.offsetWidth;
  const contentHeight = gridNode.offsetHeight + verticalOffset;

  const backgroundColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--mb-color-bg-dashboard")
    .trim();

  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(gridNode, {
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
    },
  });

  return new Promise<File | undefined>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "dashboard.png", { type: "image/png" });
        resolve(file);
      } else {
        resolve(undefined);
      }
    }, "image/png");
  });
};
