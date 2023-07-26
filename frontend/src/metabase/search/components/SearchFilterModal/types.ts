import { SearchModelType } from "metabase-types/api";

export const SearchFilterKeys = {
  TYPE: "type",
} as const;

export type TypeFilterParams = SearchModelType[];

export type SearchFilterType = {
  [SearchFilterKeys.TYPE]?: TypeFilterParams;
};

export type FilterType = keyof SearchFilterType;
