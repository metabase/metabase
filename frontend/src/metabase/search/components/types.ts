import type { IconName } from "metabase/core/components/Icon";
import type { SearchResult, Collection } from "metabase-types/api";

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
