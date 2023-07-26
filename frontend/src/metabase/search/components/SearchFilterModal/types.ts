import { FC } from "react";

export const SearchFilterKeys = {
  TYPE: "type",
} as const;

export type TypeFilterParams = string[];

export type SearchFilterType = {
  [SearchFilterKeys.TYPE]?: TypeFilterParams;
};

export type FilterType = keyof SearchFilterType;

export type SearchFilterComponent<T extends FilterType> = FC<{
  value?: SearchFilterType[T];
  onChange: (value: SearchFilterType[T]) => void;
  "data-testid"?: string;
}>;
