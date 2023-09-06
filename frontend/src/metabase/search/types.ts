import type { Location } from "history";
import type { FC } from "react";
import type {
  Collection,
  SearchModelType,
  SearchResult,
} from "metabase-types/api";
import type { IconName } from "metabase/core/components/Icon";
import type { SearchFilterKeys } from "metabase/search/constants";

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

export type TypeFilterProps = SearchModelType[];

export type SearchFilterPropTypes = {
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

export type SearchAwareLocation = Location<{ q?: string } & SearchFilters>;
