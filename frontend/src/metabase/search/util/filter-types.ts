import { FC } from "react";
import { SearchModelType } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
} as const;

export type TypeFilterProps = SearchModelType[];

type SearchFilterPropTypes = {
  [SearchFilterKeys.Type]: TypeFilterProps;
};

export type FilterTypeKeys = keyof SearchFilterPropTypes;
export type SearchFilters = Partial<SearchFilterPropTypes>;

export type SearchFilterComponent<T extends FilterTypeKeys = any> = FC<
  {
    value?: SearchFilterPropTypes[T];
    onChange: (value: SearchFilterPropTypes[T]) => void;
    "data-testid"?: string;
  } & Record<string, unknown>
>;
