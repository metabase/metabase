import { Location } from "history";
import { FC } from "react";
import { Collection, SearchModelType, SearchResult } from "metabase-types/api";
import { IconName } from "metabase/core/components/Icon";

export interface WrappedResult extends SearchResult {
  getUrl: () => string;
  getIcon: () => {
    name: IconName;
    size?: number;
    width?: number;
    height?: number;
  };
  getCollection: () => Partial<Collection>;
}

export const SearchFilterKeys = {
  Type: "type",
  CreatedBy: "created_by",
  CreatedAt: "created_at",
} as const;

export type TypeFilterProps = SearchModelType[];
export type CreatedByFilterProps = string[];
export type CreatedAtFilterProps = string[];

type SearchFilterPropTypes = {
  [SearchFilterKeys.Type]: TypeFilterProps;
  [SearchFilterKeys.CreatedBy]: CreatedByFilterProps;
  [SearchFilterKeys.CreatedAt]: CreatedAtFilterProps;
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

export type SearchAwareLocation = Location<{ q?: string } & SearchFilters>;
