import Users from "metabase/entities/users";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import type { UserId, User } from "metabase-types/api";

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
