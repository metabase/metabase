import type { RenderingContext } from "metabase/visualizations/types";

import { PARENT_HEADER_VALUE_PERCENT_GAP } from "./model/labels";
import { groupHeader, leafBlock } from "./style";

export function getLeafLabelStyle(
  renderingContext: RenderingContext,
  textColor?: string,
) {
  const color = textColor ?? renderingContext.getColor("white");
  return {
    color,
    rich: getRichLeafLabel(renderingContext, textColor),
  };
}

export function getRichLeafLabel(
  renderingContext: RenderingContext,
  textColor?: string,
) {
  const color = textColor ?? renderingContext.getColor("white");
  const base = {
    fontFamily: renderingContext.fontFamily,
    color,
  };

  return {
    name: {
      ...base,
      fontSize: leafBlock.name.fontSize,
      fontWeight: leafBlock.name.fontWeight,
      height: leafBlock.name.height,
      verticalAlign: "middle" as const,
    },
    value: {
      ...base,
      fontSize: leafBlock.value.fontSize,
      fontWeight: leafBlock.value.fontWeight,
      padding: [leafBlock.valueGap, 0, 0, 0],
      height: leafBlock.value.height,
      verticalAlign: "middle" as const,
    },
    pct: {
      ...base,
      fontSize: leafBlock.percent.fontSize,
      fontWeight: leafBlock.percent.fontWeight,
      height: leafBlock.percent.height,
      lineHeight: leafBlock.percent.height,
      padding: [leafBlock.percentGap, 0, 0, 0],
      verticalAlign: "middle" as const,
    },
  };
}

export function getRichUpperLabel({
  groupTint,
  displayName,
  valueLabel,
  percentLabel,
  nameColumnWidth,
  renderingContext,
}: {
  groupTint: string | undefined;
  displayName: string;
  valueLabel: string;
  percentLabel: string;
  nameColumnWidth: number;
  renderingContext: RenderingContext;
}) {
  const textPrimary = renderingContext.getColor("text-primary");
  const textSecondary = renderingContext.getColor("text-secondary");
  const fontFamily = renderingContext.fontFamily;

  return {
    backgroundColor: groupTint,
    formatter: getHeaderFormatter(displayName, valueLabel, percentLabel),
    rich: {
      name: {
        fontFamily,
        width: nameColumnWidth,
        overflow: "truncate",
        align: "left",
        color: textPrimary,
        fontSize: groupHeader.fontSize,
        fontWeight: groupHeader.fontWeight,
      },
      value: {
        fontFamily,
        color: textPrimary,
        fontSize: groupHeader.fontSize,
        fontWeight: groupHeader.fontWeight,
        padding: [0, 0, 0, PARENT_HEADER_VALUE_PERCENT_GAP],
      },
      pct: {
        fontFamily,
        color: textSecondary,
        fontSize: groupHeader.fontSize,
        fontWeight: groupHeader.percentFontWeight,
        padding: [0, 0, 0, groupHeader.valuePercentGap],
      },
    },
  };
}

function getHeaderFormatter(
  displayName: string,
  valueLabel: string,
  percentLabel: string,
) {
  return `{name|${sanitizeRichTextContent(displayName)}}{value|${sanitizeRichTextContent(valueLabel)}}{pct|${sanitizeRichTextContent(percentLabel)}}`;
}

export function getLeafFormatter(
  name: string,
  valueLabel: string,
  percentLabel: string,
): string {
  return `{name|${sanitizeRichTextContent(name)}}\n{value|${sanitizeRichTextContent(valueLabel)}}\n{pct|${sanitizeRichTextContent(percentLabel)}}`;
}

// characters {}| are part of the echarts rich template syntax
export function sanitizeRichTextContent(text: string): string {
  return text.replace(/[{}|]/g, "");
}
