import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { Groups } from "metabase/entities/groups";
import type { GroupInfo } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useGroupListQuery = (
  props: UseEntityListQueryProps<Record<string, never>> = {},
): UseEntityListQueryResult<GroupInfo> => {
  return useEntityListQuery<GroupInfo, Record<string, never>>(props, {
    fetchList: Groups.actions.fetchList,
    getList: Groups.selectors.getList,
    getLoading: Groups.selectors.getLoading,
    getLoaded: Groups.selectors.getLoaded,
    getError: Groups.selectors.getError,
    getListMetadata: Groups.selectors.getListMetadata,
  });
};
