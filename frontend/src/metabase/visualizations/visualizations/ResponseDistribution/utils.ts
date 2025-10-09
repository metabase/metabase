import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import {
  calculateWeightedScore,
  getColorForWeight,
} from "../../shared/utils/scoring";

export interface ProcessedOption {
  text: string;
  weight: number;
  count: number;
  percentage: number;
  isCNA: boolean;
  order?: number;
  color: string;
}

export interface ProcessedData {
  options: ProcessedOption[];
  overallScore: number;
  totalResponses: number;
}

/**
 * Detects if an option is a CNA (Choose Not to Answer) response
 */
export function isCNAOption(
  row: any[],
  isCNAColumnIndex: number | null,
): boolean {
  if (isCNAColumnIndex === null || isCNAColumnIndex === undefined) {
    return false;
  }
  // Check if the value is truthy (could be boolean true, 1, "true", etc.)
  const value = row[isCNAColumnIndex];
  return Boolean(value);
}

/**
 * Sorts options by specified column, with CNA always last
 * @param options - Array of processed options
 * @param useCustomOrder - If true, sorts by the order field; if false, keeps data order
 */
export function sortOptions(
  options: ProcessedOption[],
  useCustomOrder: boolean,
): ProcessedOption[] {
  const sorted = [...options];

  if (useCustomOrder) {
    // Sort by order field if available
    sorted.sort((a, b) => {
      // CNA always goes last
      if (a.isCNA && !b.isCNA) {
        return 1;
      }
      if (!a.isCNA && b.isCNA) {
        return -1;
      }
      if (a.isCNA && b.isCNA) {
        return 0;
      }

      // Sort by order field
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return 0;
    });
  } else {
    // Keep original data order, just ensure CNA is last
    sorted.sort((a, b) => {
      if (a.isCNA && !b.isCNA) {
        return 1;
      }
      if (!a.isCNA && b.isCNA) {
        return -1;
      }
      return 0;
    });
  }

  return sorted;
}

/**
 * Processes raw data into display format
 */
export function processData(
  data: DatasetData,
  settings: VisualizationSettings,
): ProcessedData {
  const textColumn = settings["response_distribution.option_text_column"];
  const weightColumn = settings["response_distribution.option_weight_column"];
  const countColumn = settings["response_distribution.response_count_column"];
  const totalColumn = settings["response_distribution.total_responses_column"];
  const isCNAColumn = settings["response_distribution.is_cna_column"];
  const useCustomOrder =
    settings["response_distribution.use_custom_order"] ?? false;
  const orderColumn = settings["response_distribution.option_order_column"];

  // Find column indices
  const textIdx = data.cols.findIndex((col) => col.name === textColumn);
  const weightIdx = data.cols.findIndex((col) => col.name === weightColumn);
  const countIdx = data.cols.findIndex((col) => col.name === countColumn);
  const totalIdx = data.cols.findIndex((col) => col.name === totalColumn);
  const isCNAIdx =
    isCNAColumn !== null && isCNAColumn !== undefined
      ? data.cols.findIndex((col) => col.name === isCNAColumn)
      : null;
  const orderIdx =
    useCustomOrder && orderColumn
      ? data.cols.findIndex((col) => col.name === orderColumn)
      : null;

  // Get total responses (assume same for all rows, take from first row)
  const totalResponses =
    totalIdx >= 0 && data.rows.length > 0
      ? Number(data.rows[0][totalIdx])
      : data.rows.reduce(
          (sum, row) => sum + (countIdx >= 0 ? Number(row[countIdx]) : 0),
          0,
        );

  // Process each row into an option with edge case handling
  const options: ProcessedOption[] = data.rows.map((row) => {
    const text =
      textIdx >= 0 && row[textIdx] !== null && row[textIdx] !== undefined
        ? String(row[textIdx]).trim()
        : "";
    const weight =
      weightIdx >= 0 && row[weightIdx] !== null && row[weightIdx] !== undefined
        ? Number(row[weightIdx])
        : 0;
    const count =
      countIdx >= 0 && row[countIdx] !== null && row[countIdx] !== undefined
        ? Number(row[countIdx])
        : 0;
    const isCNA = isCNAIdx !== null ? isCNAOption(row, isCNAIdx) : false;
    const order =
      orderIdx !== null && orderIdx >= 0 ? Number(row[orderIdx]) : undefined;

    // Calculate percentage with safety checks
    const percentage =
      totalResponses > 0 && Number.isFinite(count)
        ? (count / totalResponses) * 100
        : 0;

    // Ensure weight and count are valid numbers
    const safeWeight = Number.isFinite(weight) ? weight : 0;
    const safeCount = Number.isFinite(count) ? count : 0;

    const color = getColorForWeight(safeWeight, isCNA);

    return {
      text,
      weight: safeWeight,
      count: safeCount,
      percentage: Number.isFinite(percentage) ? percentage : 0,
      isCNA,
      order,
      color,
    };
  });

  // Sort options
  const sortedOptions = sortOptions(options, useCustomOrder);

  // Calculate overall score
  const overallScore = calculateWeightedScore(sortedOptions);

  return {
    options: sortedOptions,
    overallScore,
    totalResponses,
  };
}

/**
 * Validates if data is sensible for this visualization
 */
export function isResponseDistributionSensible(data: DatasetData): boolean {
  // Need at least 1 row and at least 2 columns (text and count minimum)
  return data.rows.length > 0 && data.cols.length >= 2;
}
