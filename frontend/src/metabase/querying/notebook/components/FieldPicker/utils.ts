interface GetNextSelectedColumnsOpts<T> {
  columns: readonly T[];
  selectedColumns: readonly T[];
  toggledColumns: readonly T[];
  isSelected: boolean;
}

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
