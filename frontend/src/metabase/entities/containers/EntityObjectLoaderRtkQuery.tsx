import { bindActionCreators } from "@reduxjs/toolkit";
import { useMemo } from "react";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

type Selector<T> = (state: State, entityOptions: EntityOptions) => T;

type RequestType = "fetch" | string;

type EntityId = string | number;
type EntityIdSelector = (state: State, props: unknown) => EntityId;

type EntityQuery = any;
type EntityQuerySelector = (state: State, props: unknown) => EntityQuery;

type EntityType = "database" | "table" | string; // TODO
type EntityTypeSelector = (state: State, props: unknown) => EntityType;

interface EntityOptions {
  entityId: EntityId;
  requestType: RequestType;
}

interface EntityDefinition {
  actions: {
    [actionName: string]: (...args: unknown[]) => unknown;
  };
  selectors: {
    getFetched: Selector<boolean>;
    getLoading: Selector<boolean>;
    getError: Selector<unknown | null>;
    [selectorName: string]: Selector<unknown>;
  };
}

interface Props {
  entityId: EntityId | EntityIdSelector;
  entityQuery: EntityQuery | EntityQuerySelector;
  entityType: EntityType | EntityTypeSelector;
  selectorName?: string;
  requestType?: RequestType;
  // reloadInterval?: (state: State, props: unknown) => number;
}

export const EntityObjectLoaderRtkQuery = ({
  entityId: entityIdProp,
  entityQuery: entityQueryProp,
  entityType: entityTypeProp,
  selectorName = "getObject",
  requestType = "fetch",
  ...props
}: Props) => {
  const dispatch = useDispatch();

  const entityType = useSelector(state =>
    typeof entityTypeProp === "function"
      ? entityTypeProp(state, props)
      : entityTypeProp,
  );

  const entityDef: EntityDefinition = useMemo(() => {
    // dynamic require due to circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const entitiesDefinitions = require("metabase/entities");
    return entitiesDefinitions[entityType];
  }, [entityType]);

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

  const actionCreators = useMemo(() => {
    return bindActionCreators(entityDef.actions, dispatch);
  }, [entityDef.actions, dispatch]);

  return {
    entityId,
    entityQuery: memoizedEntityQuery,
    object,
    fetched,
    loading,
    error,
  };
};
