import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import Users from "metabase/entities/users";
import type {
  UserListQuery,
  UserListResult,
  UserListMetadata,
} from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useUserListQuery = (
  props: UseEntityListQueryProps<UserListQuery> = {},
): UseEntityListQueryResult<UserListResult, UserListMetadata> => {
  return useEntityListQuery(props, {
    fetchList: Users.actions.fetchList,
    getList: Users.selectors.getList,
    getLoading: Users.selectors.getLoading,
    getLoaded: Users.selectors.getLoaded,
    getError: Users.selectors.getError,
    getListMetadata: Users.selectors.getListMetadata,
  });
};
