interface GetNextSelectedColumnsOpts<T> {
  columns: readonly T[];
  selectedColumns: readonly T[];
  toggledColumns: readonly T[];
  isSelected: boolean;
}

/**
 * Called after a subset of columns is toggled, returning the new set of
 * selected columns.
 * @param arg
 * @param arg.columns - all available columns
 * @param arg.selectedColumns - selected columns before calling this function
 * @param arg.toggledColumns - columns to toggle
 * @param arg.isSelected - value to change the toggled columns to
 */
export function getNextSelectedColumns<T>({
  columns,
  selectedColumns,
  toggledColumns,
  isSelected,
}: GetNextSelectedColumnsOpts<T>): T[] {
  const selected = new Set(selectedColumns);
  const targets = new Set(toggledColumns);

  return columns.filter((column) =>
    targets.has(column) ? isSelected : selected.has(column),
  );
}
