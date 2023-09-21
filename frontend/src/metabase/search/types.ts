import type { Location } from "history";
import type { ComponentType } from "react";

import type {
  Collection,
  EnabledSearchModelType,
  SearchResult,
  UserId,
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

export type TypeFilterProps = EnabledSearchModelType[];
export type CreatedByFilterProps = UserId | undefined;

export type SearchFilterPropTypes = {
  [SearchFilterKeys.Type]: TypeFilterProps;
  [SearchFilterKeys.CreatedBy]: CreatedByFilterProps;
};

export type FilterTypeKeys = keyof SearchFilterPropTypes;

// All URL query parameters are returned as strings so we need to account
// for that when parsing them to our filter components
export type URLSearchFilterQueryParams = Partial<
  Record<FilterTypeKeys, string | string[] | null | undefined>
>;
export type SearchAwareLocation = Location<
  { q?: string } & URLSearchFilterQueryParams
>;

export type SearchFilters = Partial<SearchFilterPropTypes>;

export type SearchFilterComponentProps<T extends FilterTypeKeys = any> = {
  value?: SearchFilterPropTypes[T];
  onChange: (value: SearchFilterPropTypes[T]) => void;
  "data-testid"?: string;
} & Record<string, unknown>;

export type SearchSidebarFilterComponent<T extends FilterTypeKeys = any> = {
  title: string;
  iconName: IconName;
  DisplayComponent: ComponentType<Pick<SearchFilterComponentProps<T>, "value">>;
  ContentComponent: ComponentType<SearchFilterComponentProps<T>>;
  // two functions for converting strings to the desired prop type and back
  // (e.g. for converting a string to a date)
  fromUrl: (
    value: string | string[] | null | undefined,
  ) => SearchFilterPropTypes[T];
  toUrl: (value?: SearchFilterPropTypes[T]) => string | string[] | undefined;
};
