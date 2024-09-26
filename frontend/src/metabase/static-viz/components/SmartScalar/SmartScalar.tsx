import type { CSSProperties } from "react";

import type {
  RenderingContext,
  StaticVisualizationProps,
} from "metabase/visualizations/types";
import {
  CHANGE_TYPE_OPTIONS,
  computeTrend,
} from "metabase/visualizations/visualizations/SmartScalar/compute";
import { formatChange } from "metabase/visualizations/visualizations/SmartScalar/utils";

export function SmartScalar({
  rawSeries,
  settings,
  renderingContext,
}: StaticVisualizationProps) {
  const { fontFamily, getColor } = renderingContext;
  const [{ card, data }] = rawSeries;
  const { insights } = data;

  const { trend, error } = computeTrend(rawSeries, insights, settings, {
    getColor,
  });

  if (error || !trend) {
    throw new Error(
      `Failed to compute trend data for ${card.name}\: ${
        (error as { message: string }).message
      }`,
    );
  }

  const comparisons: any[] = trend.comparisons || [];

  const styles: Record<string, CSSProperties> = {
    root: {
      fontFamily,
      fontSize: "14px",
    },
    value: {
      color: getColor("text-dark"),
      fontSize: "24px",
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

  let icon: string | null = null;

  if (comparison.changeArrowIconName === "arrow_up") {
    icon = "↑";
  } else if (comparison.changeArrowIconName === "arrow_down") {
    icon = "↓";
  }

  const styles: Record<string, CSSProperties> = {
    root: {
      fontSize: "14px",
    },
    icon: {
      fontSize: "14px",
      color: comparison.changeColor,
      marginRight: "6px",
    },
    percentChange: {
      color: comparison.changeColor || getColor("text-light"),
      fontWeight: 900,
    },
    separator: {
      color: getColor("text-light"),
      fontSize: "10px",
      margin: "0 2px",
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
    <span style={styles.root}>
      {!!icon && <span style={styles.icon}>{icon}</span>}
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
