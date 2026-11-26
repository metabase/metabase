export type ResultTable = {
  columns: string[];
  rows: string[][];
};

export type DbtExplorationResults = {
  byMonth: ResultTable;
  byMonthCustomer: ResultTable;
  naiveJoin: ResultTable;
  files: Record<string, string>;
};
