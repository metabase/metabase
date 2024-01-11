import type { CSSProperties } from "react";
import type {
  StaticVisualizationProps,
  RenderingContext,
} from "metabase/visualizations/types";
import type { OptionsType } from "metabase/lib/formatting/types";
import {
  computeTrend,
  CHANGE_TYPE_OPTIONS,
} from "metabase/visualizations/visualizations/SmartScalar/compute";
import { ArrowDown, ArrowUp } from "./icons";

export function SmartScalar({
  rawSeries,
  dashcardSettings,
  renderingContext,
}: StaticVisualizationProps) {
  const { fontFamily, formatValue, getColor } = renderingContext;
  const [{ card, data }] = rawSeries;
  const { insights } = data;

  const settings = {
    ...card.visualization_settings,
    ...dashcardSettings,
  };

  const trend = computeTrend(rawSeries, insights, settings, {
    formatValue,
    color: getColor,
  });

  if (!trend) {
    throw new Error(`Failed to compute trend data for ${card.name}`);
  }

  const { display, formatOptions } = trend;
  const comparisons: any[] = trend.comparisons || [];

  const styles: Record<string, CSSProperties> = {
    root: {
      fontFamily,
      fontSize: "14px",
    },
    value: {
      color: getColor("text-dark"),
      fontSize: "70px",
      fontWeight: 700,
    },
    date: {
      color: getColor("text-dark"),
      fontWeight: 700,
    },
    comparisonList: {
      margin: 0,
      padding: 0,
      marginTop: "8px",
      listStyleType: "none",
    },
    comparisonListItem: {
      marginTop: "4px",
    },
  };

  return (
    <div style={styles.root}>
      <div style={styles.value}>{display.value}</div>
      <div style={styles.date}>{display.date}</div>
      <ul style={styles.comparisonList}>
        {comparisons.map((comparison, index) => (
          <li key={index} style={styles.comparisonListItem}>
            <Comparison
              comparison={comparison}
              formatOptions={formatOptions}
              renderingContext={renderingContext}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ComparisonProps {
  comparison: any;
  formatOptions: OptionsType;
  renderingContext: RenderingContext;
}

function Comparison({
  comparison,
  formatOptions,
  renderingContext,
}: ComparisonProps) {
  const { formatValue, getColor } = renderingContext;

  const changeDisplayValue =
    comparison.changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? formatChange(comparison.percentChange)
      : comparison.display.percentChange;

  const separatorText = " • ";

  const comparisonValue = formatValue(comparison.comparisonValue, {
    ...formatOptions,
    compact: true,
  });

  const comparisonDescription = `${comparison.comparisonDescStr}: `;

  const Icon =
    comparison.changeArrowIconName === "arrow_up" ? ArrowUp : ArrowDown;

  const styles: Record<string, CSSProperties> = {
    icon: {
      width: "14px",
      height: "14px",
      fill: comparison.changeColor,
      marginRight: "8px",
    },
    percentChange: {
      color: comparison.changeColor,
      fontWeight: 900,
    },
    separator: {
      color: getColor("text-light"),
      fontSize: "10px",
      margin: "0 4px",
    },
    comparisonDescription: {
      color: getColor("text-medium"),
      fontWeight: 700,
    },
    comparisonValue: {
      color: getColor("text-light"),
      fontWeight: 700,
    },
  };

  return (
    <span>
      <Icon style={styles.icon} />
      <span>
        <span style={styles.percentChange}>{changeDisplayValue}</span>
        <span style={styles.separator}>{separatorText}</span>
        <span style={styles.comparisonDescription}>
          {comparisonDescription}
        </span>
        <span style={styles.comparisonValue}>{comparisonValue}</span>
      </span>
    </span>
  );
}

function formatChange(change: number) {
  const n = Math.abs(change);
  if (n === Infinity) {
    return "∞%";
  }
  const percent = n * 100;
  const rounded = Number.isInteger(percent)
    ? percent
    : Number(percent.toFixed(2));
  return `${rounded.toLocaleString()}%`;
}
