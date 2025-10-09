import { useMemo } from "react";
import { t } from "ttag";

import { Tooltip } from "metabase/ui";
import {
  getColorForWeight,
  halfRoundToEven,
} from "metabase/visualizations/shared/utils/scoring";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { Series, VisualizationSettings } from "metabase-types/api";

import type { VisualizationProps } from "../../types";

import styles from "./ResponseDistribution.module.css";
import { RESPONSE_DISTRIBUTION_SETTINGS } from "./settings";
import { processData } from "./utils";

export function ResponseDistribution({
  rawSeries,
  settings,
}: VisualizationProps) {
  const [{ data }] = rawSeries;

  // Process the data
  const { options, overallScore } = processData(data, settings);

  // Get question title from specified column
  const questionTitle = useMemo(() => {
    const titleColumn = settings["response_distribution.question_title_column"];

    if (titleColumn && data.rows.length > 0) {
      const titleIdx = data.cols.findIndex((col) => col.name === titleColumn);
      if (titleIdx >= 0) {
        const title = String(data.rows[0][titleIdx]);
        return title?.trim() || "";
      }
    }

    return "";
  }, [data.cols, data.rows, settings]);

  if (options.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          {t`No data to display. Please check your query and column settings.`}
        </div>
      </div>
    );
  }

  // Get score badge color based on overall score
  // Handle edge cases for score calculation
  const safeScore = Number.isFinite(overallScore) ? overallScore : 0;
  const roundedScore = halfRoundToEven(safeScore, 2);
  const scoreBadgeColor = getColorForWeight(safeScore, false);

  return (
    <div
      className={styles.container}
      style={
        { "--mb-color-score-text": scoreBadgeColor } as React.CSSProperties
      }
    >
      {/* Header with title and score badge */}
      <div className={styles.header}>
        <h3 className={styles.title}>{questionTitle}</h3>
        <div
          className={styles.scoreBadge}
          role="status"
          aria-label={t`Overall score: ${roundedScore.toFixed(2)}`}
        >
          {roundedScore.toFixed(2)}
        </div>
      </div>

      {/* Segmented bar chart */}
      <div
        className={styles.segmentedBarContainer}
        role="img"
        aria-label={t`Segmented bar chart showing response distribution`}
      >
        {options.map((option) => {
          const widthPercentage = option.percentage;

          // Don't render segments with 0%
          if (widthPercentage === 0) {
            return null;
          }

          // Create a unique key from option properties
          const optionKey = `${option.text}-${option.weight}-${option.count}`;

          return (
            <Tooltip
              key={optionKey}
              label={`${option.text}: ${option.percentage.toFixed(1)}% (${option.count})`}
              position="top"
            >
              <div
                className={styles.segment}
                style={{
                  width: `${widthPercentage}%`,
                  backgroundColor: option.color,
                }}
                aria-label={`${option.text}: ${option.percentage.toFixed(1)}% with ${option.count} responses`}
              />
            </Tooltip>
          );
        })}
      </div>

      {/* Legend */}
      <div
        className={styles.legend}
        role="list"
        aria-label={t`Response options`}
      >
        {options.map((option) => {
          // Create a unique key from option properties
          const optionKey = `legend-${option.text}-${option.weight}-${option.count}`;

          return (
            <div key={optionKey} className={styles.legendItem} role="listitem">
              <div
                className={styles.colorIndicator}
                style={{ backgroundColor: option.color }}
                aria-hidden="true"
              />
              <div className={styles.optionText}>{option.text}</div>
              <div className={styles.optionStats}>
                {`${option.percentage.toFixed(0)}% (${option.count})`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Static properties for visualization registration
Object.assign(ResponseDistribution, {
  getUiName: () => t`Response Distribution`,
  identifier: "response_distribution",
  iconName: "horizontal_bar",
  minSize: getMinSize("progress"), // Use similar size to progress
  defaultSize: getDefaultSize("progress"),

  isSensible: ({ rows }: { cols: any[]; rows: any[] }) => {
    return rows.length > 0;
  },

  checkRenderable: (series: Series, settings: VisualizationSettings) => {
    const [{ data }] = series;

    // Check that required columns are configured
    if (!settings["response_distribution.option_text_column"]) {
      throw new Error(t`Please select an option text column in the settings.`);
    }
    if (!settings["response_distribution.response_count_column"]) {
      throw new Error(
        t`Please select a response count column in the settings.`,
      );
    }

    // Weight column is required for calculating the overall score
    if (!settings["response_distribution.option_weight_column"]) {
      throw new Error(
        t`Please select an option weight column in the settings.`,
      );
    }

    // Validate that we have data
    if (!data.rows || data.rows.length === 0) {
      throw new Error(t`No data available for this question.`);
    }
  },

  settings: RESPONSE_DISTRIBUTION_SETTINGS,

  disableClickBehavior: true,
});
