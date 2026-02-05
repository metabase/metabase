import type * as Lib from "metabase-lib";
import type { DateFormattingSettings } from "metabase-types/api";

export type FilterOperatorOption<T extends Lib.FilterOperator> = {
  operator: T;
  displayName: string;
};

export type DateFilterDisplayOpts = {
  // whether to include `On` prefix for a single date filter
  withPrefix?: boolean;
  formattingSettings?: DateFormattingSettings;
};
