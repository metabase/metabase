import { WritebackAction, WritebackActionListQuery } from "metabase-types/api";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import Actions from "metabase/entities/actions";

export const useActionListQuery = (
  props: UseEntityListQueryProps<WritebackActionListQuery> = {},
): UseEntityListQueryResult<WritebackAction> => {
  return useEntityListQuery(props, {
    fetchList: Actions.actions.fetchList,
    getList: Actions.selectors.getList,
    getLoading: Actions.selectors.getLoading,
    getLoaded: Actions.selectors.getLoaded,
    getError: Actions.selectors.getError,
  });
};
