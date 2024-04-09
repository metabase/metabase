import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import Actions from "metabase/entities/actions";
import type {
  WritebackAction,
  WritebackActionListQuery,
} from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useActionListQuery = (
  props: UseEntityListQueryProps<WritebackActionListQuery> = {},
): UseEntityListQueryResult<WritebackAction> => {
  return useEntityListQuery(props, {
    fetchList: Actions.actions.fetchList,
    getList: Actions.selectors.getList,
    getLoading: Actions.selectors.getLoading,
    getLoaded: Actions.selectors.getLoaded,
    getError: Actions.selectors.getError,
    getListMetadata: Actions.selectors.getListMetadata,
  });
};
