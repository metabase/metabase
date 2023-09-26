import Users from "metabase/entities/users";
import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/use-entity-list-query";
import type { UserListResult } from "metabase-types/api";

export const useUserListQuery = (
  props: UseEntityListQueryProps<Record<string, never>> = {},
): UseEntityListQueryResult<UserListResult> => {
  return useEntityListQuery(props, {
    fetchList: Users.actions.fetchList,
    getList: Users.selectors.getList,
    getLoading: Users.selectors.getLoading,
    getLoaded: Users.selectors.getLoaded,
    getError: Users.selectors.getError,
    getListMetadata: Users.selectors.getListMetadata,
  });
};
