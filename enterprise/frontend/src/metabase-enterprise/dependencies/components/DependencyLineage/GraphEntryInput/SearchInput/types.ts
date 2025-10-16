import type { SelectOption } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

export type SearchSelectOption = SelectOption & {
  result: SearchResult;
};
