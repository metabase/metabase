/**
 * Shared scoring utilities for visualizations that use scored question data.
 * This module provides consistent color mapping and score calculation across
 * Response Distribution and other scoring-based visualizations.
 */

/**
 * Score threshold constants based on WPM-2848 specification
 * ≤78.6 → "Needs Improvement"
 * 78.6–92.9 → "Satisfactory"
 * ≥92.9 → "Exceptional"
 */
export const SCORE_THRESHOLDS = {
  NEEDS_IMPROVEMENT_MAX: 78.6,
  SATISFACTORY_MAX: 92.9,
} as const;

/**
 * Score category types for type safety
 */
export type ScoreCategory =
  | "needs_improvement"
  | "satisfactory"
  | "exceptional"
  | "cna";

/**
 * Returns CSS variable for color based on weight thresholds.
 * Uses globally defined CSS variables in colors.module.css:
 * - --mb-color-scoring-needs-improvement
 * - --mb-color-scoring-satisfactory
 * - --mb-color-scoring-exceptional
 * - --mb-color-scoring-cna
 *
 * @param weight - Score value (0-100)
 * @param isCNA - Whether this is a "Choose Not to Answer" response
 * @returns CSS variable string
 */
export function getColorForWeight(weight: number, isCNA: boolean): string {
  if (isCNA) {
    return SCORING_COLOR_VARS.cna;
  }

  if (weight <= SCORE_THRESHOLDS.NEEDS_IMPROVEMENT_MAX) {
    return SCORING_COLOR_VARS.needsImprovement;
  } else if (weight < SCORE_THRESHOLDS.SATISFACTORY_MAX) {
    return SCORING_COLOR_VARS.satisfactory;
  } else {
    return SCORING_COLOR_VARS.exceptional;
  }
}

/**
 * Gets the score category for a given weight
 *
 * @param weight - Score value (0-100)
 * @param isCNA - Whether this is a "Choose Not to Answer" response
 * @returns Score category identifier
 */
export function getScoreCategory(
  weight: number,
  isCNA: boolean,
): ScoreCategory {
  if (isCNA) {
    return "cna";
  }

  if (weight <= SCORE_THRESHOLDS.NEEDS_IMPROVEMENT_MAX) {
    return "needs_improvement";
  } else if (weight < SCORE_THRESHOLDS.SATISFACTORY_MAX) {
    return "satisfactory";
  } else {
    return "exceptional";
  }
}

/**
 * Gets the human-readable label for a score category
 *
 * @param weight - Score value (0-100)
 * @param isCNA - Whether this is a "Choose Not to Answer" response
 * @returns Human-readable category label
 */
export function getColorCategoryLabel(weight: number, isCNA: boolean): string {
  if (isCNA) {
    return "Choose Not to Answer";
  }
  if (weight <= SCORE_THRESHOLDS.NEEDS_IMPROVEMENT_MAX) {
    return "Needs Improvement";
  } else if (weight < SCORE_THRESHOLDS.SATISFACTORY_MAX) {
    return "Satisfactory";
  } else {
    return "Exceptional";
  }
}

/**
 * Interface for items used in score calculation
 */
export interface ScoredItem {
  weight: number;
  count: number;
  isCNA: boolean;
}

/**
 * Calculates weighted average score (0-100) excluding CNA responses.
 * Handles edge cases: NaN, Infinity, and division by zero.
 *
 * @param items - Array of items with weight, count, and isCNA properties
 * @returns Calculated score or 0 if invalid
 */
export function calculateWeightedScore(items: ScoredItem[]): number {
  const nonCNAItems = items.filter((item) => !item.isCNA);

  if (nonCNAItems.length === 0) {
    return 0;
  }

  const totalWeightedScore = nonCNAItems.reduce(
    (sum, item) => sum + item.weight * item.count,
    0,
  );
  const totalCount = nonCNAItems.reduce((sum, item) => sum + item.count, 0);

  if (totalCount === 0 || !Number.isFinite(totalWeightedScore)) {
    return 0;
  }

  const score = totalWeightedScore / totalCount;

  // Return 0 for invalid scores (NaN, Infinity)
  return Number.isFinite(score) ? score : 0;
}

/**
 * Formats a score for display (2 decimal places)
 *
 * @param score - Score value to format
 * @returns Formatted string
 */
export function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(2) : "0.00";
}

/**
 * All scoring color CSS variables as an object for easy reference
 */
export const SCORING_COLOR_VARS = {
  needsImprovement: "var(--mb-color-scoring-needs-improvement)",
  satisfactory: "var(--mb-color-scoring-satisfactory)",
  exceptional: "var(--mb-color-scoring-exceptional)",
  cna: "var(--mb-color-scoring-cna)",
} as const;
