import { FC } from "react";
import { SearchModelType } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
} as const;

export type TypeFilterProps = SearchModelType[];

export type SearchFilterType = {
  [SearchFilterKeys.Type]: TypeFilterProps;
};

export type SearchFilters = Partial<SearchFilterType>;

export type FilterType = keyof SearchFilterType;

export type SearchFilterComponent<T extends FilterType = any> = FC<
  {
    value?: SearchFilterType[T];
    onChange: (value: SearchFilterType[T]) => void;
    "data-testid"?: string;
  } & Record<string, unknown>
>;
