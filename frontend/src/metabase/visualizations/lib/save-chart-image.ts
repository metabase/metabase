// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

import GlobalDashboardS from "metabase/css/dashboard.module.css";
import DashboardS from "metabase/dashboard/components/Dashboard/Dashboard.module.css";
import DashboardGridS from "metabase/dashboard/components/DashboardGrid.module.css";
import { isEmbeddingSdk, isStorybookActive } from "metabase/env";
import { openImageBlobOnStorybook } from "metabase/lib/loki-utils";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

export const SAVING_DOM_IMAGE_CLASS = "saving-dom-image";
export const SAVING_DOM_IMAGE_HIDDEN_CLASS = "saving-dom-image-hidden";
export const SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS =
  "saving-dom-image-display-none";

export const saveDomImageStyles = css`
  .${SAVING_DOM_IMAGE_CLASS} {
    .${SAVING_DOM_IMAGE_HIDDEN_CLASS} {
      visibility: hidden;
    }
    .${SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS} {
      display: none;
    }

    .${DashboardS.FixedWidthContainer} {
      legend {
        top: -9px;
      }
    }

    .${DashboardGridS.DashboardCardContainer} .${GlobalDashboardS.Card} {
      /* the renderer we use for saving to image/pdf doesn't support box-shadow
        so we replace it with a border */
      box-shadow: none;
      border: 1px solid var(--mb-color-border);
    }

    /* the renderer for saving to image/pdf does not support text overflow
     with line height in custom themes in the embedding sdk.
     this is a workaround to make sure the text is not clipped vertically */
    ${isEmbeddingSdk &&
    css`
      .${DashboardGridS.DashboardCardContainer} .${GlobalDashboardS.Card} * {
        overflow: visible !important;
      }
    `};
  }
`;

// 在导出之前给 canvas 加水印
function applyDiagonalWatermark(
  canvas: HTMLCanvasElement,
  text: string,
  options?: {
    font?: string;
    color?: string;
    opacity?: number;
    paddingX?: number;
    paddingY?: number;
    angleDeg?: number;
  }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const {
    font = "24px sans-serif",
    color = "rgba(0,0,0,0.2)",
    opacity = 0.2,
    paddingX = 50,
    paddingY = 30,
    angleDeg = 30,
  } = options || {};

  const { width, height } = canvas;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 测量文本尺寸
  const metrics = ctx.measureText(text);
  // measureText.width 得到文本宽度 :contentReference[oaicite:0]{index=0}
  const textWidth = metrics.width;
  // 简单地用 font size 作为文本高度的近似
  const fontSizeMatch = font.match(/(\d+)px/);
  const textHeight = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 24;

  // 根据文本尺寸和 padding 计算网格间距
  const gapX = textWidth + paddingX;
  const gapY = textHeight + paddingY;

  // 平移到中心并旋转指定角度（弧度）
  const angle = (angleDeg * Math.PI) / 180;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-angle); // 负号使文字从左上到右下

  // 计算对角线长度，保证填满
  const diagLen = Math.sqrt(width * width + height * height);
  const cols = Math.ceil(diagLen / gapX);
  const rows = Math.ceil(diagLen / gapY);

  for (let i = -cols; i <= cols; i++) {
    for (let j = -rows; j <= rows; j++) {
      const x = i * gapX;
      const y = j * gapY;
      ctx.fillText(text, x, y);
    }
  }

  ctx.restore();
}


export const saveChartImage = async (selector: string, fileName: string) => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    onclone: (doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.classList.add(EmbedFrameS.WithThemeBackground);

      node.style.borderRadius = "0px";
      node.style.border = "none";
    },
  });
  const currentStr = localStorage.getItem("current") ?? "";
  const current = JSON.parse(currentStr);
  const watermarkText = `${current?.common_name ?? ''} ${new Date().toLocaleString()}`;
  applyDiagonalWatermark(canvas, watermarkText, {
    font: "12px Arial",
    color: "rgba(0,0,0,0.15)",
    opacity: 0.3,
    paddingX: 80,
    paddingY: 50,
    angleDeg: 30,
  });

  canvas.toBlob((blob) => {
    if (blob) {
      if (isStorybookActive) {
        // if we're running storybook we open the image in place
        // so we can test the export result with loki
        openImageBlobOnStorybook({ canvas, blob });
      } else {
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.rel = "noopener";
        link.download = fileName;
        link.href = url;
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    }
  });
};
