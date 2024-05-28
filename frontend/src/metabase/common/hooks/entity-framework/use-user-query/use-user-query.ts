import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/entity-framework/use-entity-query";
import Users from "metabase/entities/users";
import type { UserId, User } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useUserQuery = (
  props: UseEntityQueryProps<UserId, null>,
): UseEntityQueryResult<User> => {
  return useEntityQuery(props, {
    fetch: Users.actions.fetch,
    getObject: Users.selectors.getObject,
    getLoading: Users.selectors.getLoading,
    getError: Users.selectors.getError,
  });
};
