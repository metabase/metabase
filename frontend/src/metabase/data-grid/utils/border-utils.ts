/**
 * Determines if a row's border should be hidden based on table settings
 *
 * @param rowIndex - The index of the current row
 * @param totalRows - The total number of rows in the table
 * @param showLastRowBorder - Whether to show the border on the last row
 * @returns true if the border should be hidden, false otherwise
 */
export function shouldHideRowBorder(
  rowIndex: number,
  totalRows: number,
  showLastRowBorder: boolean,
): boolean {
  return !showLastRowBorder && rowIndex === totalRows - 1;
}
