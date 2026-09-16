interface GetNextSelectedColumnsOpts<T> {
  columns: readonly T[];
  selectedColumns: readonly T[];
  targetColumns: readonly T[];
  isSelected: boolean;
}

export function getNextSelectedColumns<T>({
  columns,
  selectedColumns,
  targetColumns,
  isSelected,
}: GetNextSelectedColumnsOpts<T>): T[] {
  const selected = new Set(selectedColumns);
  const targets = new Set(targetColumns);

  return columns.filter((column) =>
    targets.has(column) ? isSelected : selected.has(column),
  );
}
