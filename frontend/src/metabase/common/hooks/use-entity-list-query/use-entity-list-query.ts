import { useEffect } from "react";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { EntityDefinition } from "metabase/common/types/entities";

export interface UseEntityListQueryProps<TQuery> {
  query?: TQuery;
  reload?: boolean;
  enabled?: boolean;
}

export interface UseEntityListQueryResult<TItem> {
  data?: TItem[];
  isLoading: boolean;
  error: unknown;
}

const useEntityListQuery = <TItem, TQuery>(
  entity: EntityDefinition<TItem, TQuery>,
  {
    query: entityQuery,
    reload = false,
    enabled = true,
  }: UseEntityListQueryProps<TQuery>,
): UseEntityListQueryResult<TItem> => {
  const data = useSelector(state =>
    entity.selectors.getList(state, { entityQuery }),
  );
  const isLoading = useSelector(state =>
    entity.selectors.getLoading(state, { entityQuery }),
  );
  const error = useSelector(state =>
    entity.selectors.getError(state, { entityQuery }),
  );

  const dispatch = useDispatch();
  useEffect(() => {
    if (enabled) {
      dispatch(entity.actions.fetchList(entityQuery, { reload }));
    }
  }, [entity, dispatch, entityQuery, reload, enabled]);

  return { data, isLoading, error };
};

export default useEntityListQuery;
