import { useEffect } from "react";
import { useDispatch, useSelector } from "metabase/lib/redux";
import Databases from "metabase/entities/databases";
import Database from "metabase-lib/metadata/Database";

interface DatabaseListQuery {
  saved?: boolean;
}

interface UseDatabaseListQueryProps {
  query?: DatabaseListQuery;
  reload?: boolean;
  enabled?: boolean;
}

interface UseDatabaseListQueryResult {
  databases?: Database[];
  isLoading: boolean;
  error: unknown;
}

const useDatabaseListQuery = ({
  query: entityQuery,
  reload = false,
  enabled = true,
}: UseDatabaseListQueryProps = {}): UseDatabaseListQueryResult => {
  const databases = useSelector(state =>
    Databases.selectors.getList(state, { entityQuery }),
  );
  const isLoading = useSelector(state =>
    Databases.selectors.getLoading(state, { entityQuery }),
  );
  const error = useSelector(state =>
    Databases.selectors.getError(state, { entityQuery }),
  );

  const dispatch = useDispatch();
  useEffect(() => {
    if (enabled) {
      dispatch(Databases.actions.fetchList(entityQuery, { reload }));
    }
  }, [dispatch, entityQuery, reload, enabled]);

  return { databases, isLoading, error };
};

export default useDatabaseListQuery;
