import type * as Lib from "metabase-lib";

export type ListItem = Lib.ColumnDisplayInfo & {
  column: Lib.ColumnMetadata;
  breakout?: Lib.BreakoutClause;
};

export type ListSection = {
  name: string;
  items: ListItem[];
};
