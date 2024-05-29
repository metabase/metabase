import type { Location } from "history";
import type { ComponentType } from "react";

import type { SearchFilterKeys } from "metabase/search/constants";
import type { IconName } from "metabase/ui";
import type {
  EnabledSearchModel,
  SearchResult,
  UserId,
} from "metabase-types/api";

export interface WrappedResult extends SearchResult {
  getUrl: () => string;
  getIcon: () => {
    name: IconName;
    size?: number;
    width?: number;
    height?: number;
  };
  getCollection: () => SearchResult["collection"];
}

export type TypeFilterProps = EnabledSearchModel[];
export type CreatedByFilterProps = UserId[];
export type CreatedAtFilterProps = string | null;
export type LastEditedByProps = UserId[];
export type LastEditedAtFilterProps = string | null;
export type VerifiedFilterProps = true | null;
export type NativeQueryFilterProps = true | null;

export type SearchFilterPropTypes = {
  [SearchFilterKeys.Type]: TypeFilterProps;
  [SearchFilterKeys.Verified]: VerifiedFilterProps;
  [SearchFilterKeys.CreatedBy]: CreatedByFilterProps;
  [SearchFilterKeys.CreatedAt]: CreatedAtFilterProps;
  [SearchFilterKeys.LastEditedBy]: LastEditedByProps;
  [SearchFilterKeys.LastEditedAt]: LastEditedAtFilterProps;
  [SearchFilterKeys.NativeQuery]: NativeQueryFilterProps;
};

export type FilterTypeKeys = keyof SearchFilterPropTypes;

// All URL query parameters are returned as strings so we need to account
// for that when parsing them to our filter components
export type SearchQueryParamValue = string | string[] | null | undefined;
export type URLSearchFilterQueryParams = Partial<
  Record<FilterTypeKeys, SearchQueryParamValue>
>;
export type SearchAwareLocation = Location<
  { q?: string } & URLSearchFilterQueryParams
>;

export type SearchFilters = Partial<SearchFilterPropTypes>;

export type SearchFilterComponentProps<T extends FilterTypeKeys = any> = {
  value: SearchFilterPropTypes[T];
  onChange: (value: SearchFilterPropTypes[T]) => void;
  "data-testid"?: string;
  width?: string;
} & Record<string, unknown>;

type SidebarFilterType = "dropdown" | "toggle";

interface SearchFilter<T extends FilterTypeKeys = any> {
  type: SidebarFilterType;
  label: () => string;
  iconName?: IconName;

  // parses the string value of a URL query parameter to the filter value
  fromUrl: (value: SearchQueryParamValue) => SearchFilterPropTypes[T];

  // converts filter value to URL query parameter string value
  toUrl: (value: SearchFilterPropTypes[T] | null) => SearchQueryParamValue;
}

export interface SearchFilterDropdown<T extends FilterTypeKeys = any>
  extends SearchFilter {
  type: "dropdown";
  DisplayComponent: ComponentType<Pick<SearchFilterComponentProps<T>, "value">>;
  ContentComponent: ComponentType<SearchFilterComponentProps<T>>;
}

export interface SearchFilterToggle extends SearchFilter {
  type: "toggle";
}

export type SearchFilterComponent<T extends FilterTypeKeys = any> =
  | SearchFilterDropdown<T>
  | SearchFilterToggle;
