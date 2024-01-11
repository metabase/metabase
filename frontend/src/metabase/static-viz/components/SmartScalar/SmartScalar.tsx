import type { CSSProperties } from "react";
import type {
  StaticVisualizationProps,
  RenderingContext,
} from "metabase/visualizations/types";
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
      <div style={styles.value}>{trend.display.value}</div>
      <div style={styles.date}>{trend.display.date}</div>
      <ul style={styles.comparisonList}>
        {comparisons.map((comparison, index) => (
          <li key={index} style={styles.comparisonListItem}>
            <Comparison
              comparison={comparison}
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
  renderingContext: RenderingContext;
}

function Comparison({ comparison, renderingContext }: ComparisonProps) {
  const { getColor } = renderingContext;

  const changeDisplayValue =
    comparison.changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? formatChange(comparison.percentChange)
      : comparison.display.percentChange;

  let Icon: typeof ArrowUp | null = null;

  if (comparison.changeArrowIconName === "arrow_up") {
    Icon = ArrowUp;
  } else if (comparison.changeArrowIconName === "arrow_down") {
    Icon = ArrowDown;
  }

  const styles: Record<string, CSSProperties> = {
    icon: {
      width: "14px",
      height: "14px",
      fill: comparison.changeColor,
      marginRight: "8px",
    },
    percentChange: {
      color: comparison.changeColor || getColor("text-light"),
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
      {!!Icon && <Icon style={styles.icon} />}
      <span>
        <span style={styles.percentChange}>{changeDisplayValue}</span>
        <span style={styles.separator}> • </span>
        <span style={styles.comparisonDescription}>
          {`${comparison.comparisonDescStr}: `}
        </span>
        <span style={styles.comparisonValue}>
          {comparison.display.comparisonValue}
        </span>
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
