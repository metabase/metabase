import type { Location } from "history";
import type { ComponentType } from "react";

import type {
  Collection,
  EnabledSearchModelType,
  SearchResult,
} from "metabase-types/api";
import type { IconName } from "metabase/core/components/Icon";
import type { SearchFilterKeys } from "metabase/search/constants";

export type SearchAwareLocation = Location<{ q?: string } & SearchFilters>;

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

export type VerifiedFilterProps = true | undefined;

export type SearchFilterPropTypes = {
  [SearchFilterKeys.Type]: TypeFilterProps;
  [SearchFilterKeys.Verified]: VerifiedFilterProps;
};

export type FilterTypeKeys = keyof SearchFilterPropTypes;

export type SearchFilters = Partial<SearchFilterPropTypes>;

export type SearchFilterComponentProps<T extends FilterTypeKeys = any> = {
  value?: SearchFilterPropTypes[T];
  onChange: (value: SearchFilterPropTypes[T]) => void;
  "data-testid"?: string;
} & Record<string, unknown>;

type SidebarFilterType = "dropdown" | "toggle";

interface SearchFilter {
  type: SidebarFilterType;
  title: string;
  iconName?: IconName;
}

export interface SearchFilterDropdown<T extends FilterTypeKeys = any>
  extends SearchFilter {
  type: "dropdown";
  DisplayComponent: ComponentType<Pick<SearchFilterComponentProps<T>, "value">>;
  ContentComponent: ComponentType<SearchFilterComponentProps<T>>;
}

export interface SearchFilterToggle
  extends SearchFilter {
  type: "toggle";
}

export type SearchFilterComponent<T extends FilterTypeKeys = any> =
  | SearchFilterDropdown<T>
  | SearchFilterToggle;
