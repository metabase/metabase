// should be in sync with node_modules/@tanstack/table-core/src/core/cell.ts logic
export const getGridCellId = (rowIndex: number, columnName: string): string => {
  return `${rowIndex}_${columnName}`;
};
