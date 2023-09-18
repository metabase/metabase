import type {Location} from "history";
import type {ComponentType} from "react";

import type {Collection, SearchResult} from "metabase-types/api";
import type {IconName} from "metabase/core/components/Icon";
import type {
  SearchFilterKeys,
  enabledSearchTypes,
} from "metabase/search/constants";

export type EnabledSearchModelType = typeof enabledSearchTypes[number];

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
export type CreatedAtFilterProps = string[];

export type SearchFilterPropTypes = {
  [SearchFilterKeys.Type]: TypeFilterProps;
  [SearchFilterKeys.CreatedAt]: CreatedAtFilterProps;
};

export type FilterTypeKeys = keyof SearchFilterPropTypes;

export type SearchFilters = Partial<SearchFilterPropTypes>;

export type SearchFilterComponentProps<T extends FilterTypeKeys = any> = {
  value?: SearchFilterPropTypes[T];
  onChange: (value: SearchFilterPropTypes[T]) => void;
  "data-testid"?: string;
} & Record<string, unknown>;

export type SearchAwareLocation = Location<{ q?: string } & SearchFilters>;

export type SearchSidebarFilterComponent<T extends FilterTypeKeys = any> = {
  title: string;
  iconName: IconName;
  applyImmediately?: boolean;
  DisplayComponent: ComponentType<Pick<SearchFilterComponentProps<T>, "value">>;
  ContentComponent: ComponentType<SearchFilterComponentProps<T>>;
};
