import { Collection, SearchResult } from "metabase-types/api";
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
