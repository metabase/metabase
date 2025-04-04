export const pickRowsToMeasure = <TData, TValue>(
  data: TData[],
  accessorFn: (row: TData) => TValue,
  count = 10,
) => {
  const rowIndexes = [];
  for (
    let rowIndex = 0;
    rowIndex < data.length && rowIndexes.length < count;
    rowIndex++
  ) {
    if (accessorFn(data[rowIndex]) != null) {
      rowIndexes.push(rowIndex);
    }
  }
  return rowIndexes;
};
