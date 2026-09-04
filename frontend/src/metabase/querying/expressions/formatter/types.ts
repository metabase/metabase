import type * as Lib from "metabase-lib";

import type { StartDelimiter } from "../string";

export type ExpressionNode = Lib.ExpressionParts | Lib.ExpressionArg | null;

export type FormatOptions = {
  query?: Lib.Query;
  stageIndex?: number;
  availableColumns?: Lib.ColumnMetadata[];
  printWidth?: number;
  stringDelimiter?: StartDelimiter;
};

export type FormatClauseOptions = {
  query: Lib.Query;
  stageIndex: number;
} & FormatOptions;
