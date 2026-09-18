import type { PlainCellFormatter } from "../types";

/**
 * Formats cell value for copying, applying formatters when available.
 *
 * Null value handling:
 * - Raw copy: null/undefined -> "null"
 * - Formatted copy: null/undefined -> "" (empty string)
 *
 * @param rawValue - The raw cell value from the table
 * @param formatter - Optional formatter function from column definition
 * @param rowIndex - Row index for formatter context
 * @returns Formatted string ready for clipboard
 */
export const formatCellValueForCopy = (
  rawValue: unknown,
  formatter?: PlainCellFormatter<unknown>,
  rowIndex?: number,
  columnId?: string,
): string => {
  const isFormattedCopy =
    formatter != null && rowIndex != null && columnId != null;

  if (!isFormattedCopy) {
    if (rawValue == null) {
      return "null";
    }

    if (typeof rawValue === "object") {
      return JSON.stringify(rawValue);
    }

    return String(rawValue);
  }

  if (rawValue == null) {
    return "";
  }

  return formatter(rawValue, rowIndex, columnId);
};

const NEEDS_QUOTING_PATTERN = /[\t\n\r]/;

const needsQuoting = (text: string) => NEEDS_QUOTING_PATTERN.test(text);

export const serializeTsv = (lines: string[][]): string =>
  lines
    .map((cells) =>
      cells
        .map((cell) =>
          needsQuoting(cell) ? `"${cell.replaceAll('"', '""')}"` : cell,
        )
        .join("\t"),
    )
    .join("\n");
