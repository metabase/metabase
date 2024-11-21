import { bindActionCreators } from "@reduxjs/toolkit";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo } from "react";

import { skipToken } from "metabase/api";
import DefaultLoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setRequestError,
  setRequestLoaded,
  setRequestLoading,
  setRequestPromise,
} from "metabase/redux/requests";
import type { Dispatch } from "metabase-types/store";

import type {
  EntityDefinition,
  EntityId,
  EntityIdSelector,
  EntityQuery,
  EntityQuerySelector,
  EntityType,
  EntityTypeSelector,
  FetchType,
  RequestType,
} from "./types";

interface ChildrenProps<Entity, EntityWrapper> {
  // bulkUpdate
  // create
  // delete
  dispatch: Dispatch;
  dispatchApiErrorEvent: boolean;
  error: unknown;
  // fetch
  // fetchForeignKeys
  // fetchList
  // fetchMetadata
  // fetchMetadataAndForeignTables
  // fetchMetadataDeprecated
  fetched: boolean;
  // invalidateLists
  loading: boolean;
  object: EntityWrapper | Entity | undefined; // EntityWrapper when "wrapped" is true, Entity otherwise
  reload: () => void;
  // setFieldOrder
  // table: EntityWrapper;
  // update
  // updateProperty
}

interface LoadingAndErrorWrapperProps {
  children: ReactNode;
  loading?: boolean;
  error?: unknown;
  noWrapper?: boolean;
}

export interface Props<Entity, EntityWrapper> {
  children: (props: ChildrenProps<Entity, EntityWrapper>) => ReactNode;
  dispatchApiErrorEvent?: boolean;
  entityAlias?: string;
  entityId: EntityId | EntityIdSelector | undefined;
  entityQuery: EntityQuery | EntityQuerySelector;
  entityType: EntityType | EntityTypeSelector;
  fetchType?: FetchType;
  loadingAndErrorWrapper?: boolean;
  LoadingAndErrorWrapper: ComponentType<LoadingAndErrorWrapperProps>;
  properties: unknown; // TODO
  reload?: boolean;
  // reloadInterval?: (state: State, props: unknown) => number;
  requestType?: RequestType;
  selectorName?: string;
  wrapped?: boolean;
}

const defaultTransformResponse = (data: unknown, _query: EntityQuery) => data;

/**
 * Difference between the 2 generic types, using Database entity as an example:
 *   Entity        -> Database from metabase-types/api/database.ts
 *   EntityWrapper -> Database from metabase-lib/v1/metadata/Database.ts
 *
 * @deprecated use "metabase/api" instead
 */
export function EntityObjectLoaderRtkQuery<Entity, EntityWrapper>({
  children,
  dispatchApiErrorEvent = true,
  entityAlias,
  entityId: entityIdProp,
  entityQuery: entityQueryProp,
  entityType: entityTypeProp,
  fetchType = "fetch",
  loadingAndErrorWrapper = true,
  LoadingAndErrorWrapper = DefaultLoadingAndErrorWrapper,
  // reload = false,
  requestType = "fetch",
  selectorName = "getObject",
  wrapped = false,
  ...props
}: Props<Entity, EntityWrapper>) {
  const dispatch = useDispatch();

  const entityType = useSelector(state =>
    typeof entityTypeProp === "function"
      ? entityTypeProp(state, props)
      : entityTypeProp,
  );

  const entityDefinition: EntityDefinition<Entity, EntityWrapper> =
    useMemo(() => {
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

  const finalQuery = useMemo(
    () => ({ id: entityId, ...entityQuery }),
    [entityId, entityQuery],
  );

  const {
    action = entityDefinition.actionTypes.FETCH,
    transformResponse = defaultTransformResponse,
    /**
     * Hack: this hook appears to be acquired conditionally, which in
     * normal circumstances would violate the rules of React hooks.
     * As long as fetchType never changes during component's lifecycle
     * and getUseGetQuery is a pure function, we have a guarantee that
     * the same hook will be used and rules of hooks are not violated.
     */
    useGetQuery,
  } = entityDefinition.rtk.getUseGetQuery(fetchType);

  const {
    data,
    error: rtkError,
    isLoading,
    refetch,
  } = useGetQuery(entityId != null ? finalQuery : skipToken);

  const queryKey = useMemo(
    () => entityDefinition.getQueryKey(finalQuery),
    [entityDefinition, finalQuery],
  );

  const objectStatePath = useMemo(() => {
    if (!entityId) {
      return [];
    }

    return entityDefinition.getObjectStatePath(entityId);
  }, [entityDefinition, entityId]);

  const requestStatePath = useMemo(() => {
    return [...objectStatePath, requestType];
  }, [objectStatePath, requestType]);

  useEffect(() => {
    if (isLoading) {
      // @ts-expect-error - invalid typings in redux-actions package
      dispatch(setRequestLoading(requestStatePath, queryKey));

      // TODO: is this necessary?
      dispatch(
        setRequestPromise(
          // @ts-expect-error - invalid typings in redux-actions package
          requestStatePath,
          queryKey,
          new Promise<void>(resolve => resolve()),
        ),
      );
    }
  }, [dispatch, isLoading, requestStatePath, queryKey]);

  useEffect(() => {
    if (rtkError) {
      // @ts-expect-error - invalid typings in redux-actions package
      dispatch(setRequestError(requestStatePath, queryKey, rtkError));
    }
  }, [dispatch, rtkError, requestStatePath, queryKey]);

  useEffect(() => {
    if (data) {
      // TODO: originally this call was in setTimeout(, 0);

      // @ts-expect-error - invalid typings in redux-actions package
      dispatch(setRequestLoaded(requestStatePath, queryKey));

      const transformed = transformResponse(data, finalQuery);
      const normalized = entityDefinition.normalize(transformed);

      dispatch({ type: action, payload: normalized });
    }
  }, [
    action,
    dispatch,
    data,
    entityDefinition,
    finalQuery,
    transformResponse,
    requestStatePath,
    queryKey,
  ]);

  const entityOptions = useMemo(
    () => ({ entityId, requestType }),
    [entityId, requestType],
  );

  const object = useSelector(state => {
    return entityDefinition.selectors[selectorName](state, entityOptions);
  });

  const fetched = useSelector(state => {
    const value = entityDefinition.selectors.getFetched(state, entityOptions);
    return Boolean(value);
  });

  const loading = useSelector(state => {
    const value = entityDefinition.selectors.getLoading(state, entityOptions);
    return Boolean(value);
  });

  const error = useSelector(state => {
    return entityDefinition.selectors.getError(state, entityOptions);
  });

  const actionCreators = useMemo(() => {
    return bindActionCreators(entityDefinition.actions, dispatch);
  }, [entityDefinition.actions, dispatch]);

  const wrappedObject = useMemo(() => {
    if (!wrapped || !object) {
      return object;
    }

    return entityDefinition.wrapEntity(object, dispatch);
  }, [dispatch, object, entityDefinition, wrapped]);

  const renderedChildren = children({
    ...actionCreators,
    ...props,
    dispatch,
    dispatchApiErrorEvent,
    error,
    object: wrappedObject,
    fetched,
    loading,
    // alias the entities name:
    [entityAlias || entityDefinition.nameOne]: wrappedObject,
    reload: refetch,
  });

  if (loadingAndErrorWrapper) {
    return (
      <LoadingAndErrorWrapper
        loading={!fetched && entityId != null}
        error={error}
        noWrapper
      >
        {renderedChildren}
      </LoadingAndErrorWrapper>
    );
  }

  return renderedChildren;
}

/**
 * @deprecated HOCs are deprecated
 */
export const entityObjectLoaderRtkQuery =
  (eolProps: any) =>
  (ComposedComponent: (props: any) => ReactNode) =>
  // eslint-disable-next-line react/display-name
  (props: any): ReactNode => (
    <EntityObjectLoaderRtkQuery {...props} {...eolProps}>
      {childProps => <ComposedComponent {...childProps} />}
    </EntityObjectLoaderRtkQuery>
  );
