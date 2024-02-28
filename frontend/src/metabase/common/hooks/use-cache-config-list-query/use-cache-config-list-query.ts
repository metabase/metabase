import type { CacheConfig } from "metabase/admin/caching/types";
import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/use-entity-list-query";
//import type CacheConfig from "metabase-lib/metadata/Database";
import { CacheConfigs } from "metabase/entities/cache-configs";
import type { CacheConfigListQuery } from "metabase-types/api";
// TODO: Move this type to metabase-lib?

export const useCacheConfigListQuery = (
  props: UseEntityListQueryProps<CacheConfigListQuery> = {},
): UseEntityListQueryResult<CacheConfig> => {
  return useEntityListQuery(props, {
    fetchList: CacheConfigs.actions.fetchList,
    getList: CacheConfigs.selectors.getList,
    getLoading: CacheConfigs.selectors.getLoading,
    getLoaded: CacheConfigs.selectors.getLoaded,
    getError: CacheConfigs.selectors.getError,
    getListMetadata: CacheConfigs.selectors.getListMetadata,
  });
};
