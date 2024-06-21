import { useMemo } from "react";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

type Selector<T> = (state: State, entityOptions: EntityOptions) => T;

type RequestType = "fetch" | string;

type EntityId = string | number;

type EntityIdSelector = (state: State, props: unknown) => EntityId;

type EntityQuery = any;

type EntityQuerySelector = (state: State, props: unknown) => EntityQuery;

interface EntityOptions {
  entityId: EntityId;
  requestType: RequestType;
}

interface EntityDefinition {
  selectors: {
    getFetched: Selector<boolean>;
    getLoading: Selector<boolean>;
    getError: Selector<unknown | null>;
    [selectorName: string]: Selector<unknown>;
  };
}

interface Props {
  entityDef: EntityDefinition;
  entityId: EntityId | EntityIdSelector;
  entityQuery: EntityQuery | EntityQuerySelector;
  selectorName?: string;
  requestType?: RequestType;
  reloadInterval?: (state, props) => number;
}

export const EntityObjectLoaderRtkQuery = ({
  entityDef,
  entityId: entityIdProp,
  entityQuery: entityQueryProp,
  selectorName = "getObject",
  requestType = "fetch",
  ...props
}: Props) => {
  const entityId = useSelector(state =>
    typeof entityIdProp === "function"
      ? entityIdProp(state, props)
      : entityIdProp,
  );

  const entityQuery = useSelector(state =>
    typeof entityQueryProp === "function"
      ? entityQueryProp(state, props)
      : entityQueryProp,
  );

  const entityOptions = useMemo(
    () => ({ entityId, requestType }),
    [entityId, requestType],
  );

  const object = useSelector(state => {
    return entityDef.selectors[selectorName](state, entityOptions);
  });

  const fetched = useSelector(state => {
    return entityDef.selectors.getFetched(state, entityOptions);
  });

  const loading = useSelector(state => {
    return entityDef.selectors.getLoading(state, entityOptions);
  });

  const error = useSelector(state => {
    return entityDef.selectors.getError(state, entityOptions);
  });

  const memoizedEntityQuery = useSelector(() => entityQuery, _.isEqual);

  return {
    entityId,
    entityQuery: memoizedEntityQuery,
    object,
    fetched,
    loading,
    error,
  };
};
