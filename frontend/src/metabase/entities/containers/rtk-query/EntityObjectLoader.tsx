import { bindActionCreators } from "@reduxjs/toolkit";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { match } from "ts-pattern";

import { skipToken } from "metabase/api";
import DefaultLoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setRequestError,
  setRequestLoaded,
  setRequestLoading,
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
  dispatch: Dispatch;
  error: unknown;
  fetched: boolean;
  loading: boolean;
  /**
   * object is EntityWrapper when Props["wrapped"] is true
   */
  object: EntityWrapper | Entity | undefined;
  reload: () => void;
}

interface LoadingAndErrorWrapperProps {
  children: ReactNode;
  loading?: boolean;
  error?: unknown;
  noWrapper?: boolean;
}

interface Props<Entity, EntityWrapper> {
  ComposedComponent: (props: ChildrenProps<Entity, EntityWrapper>) => ReactNode;
  entityAlias?: string;
  entityId: EntityId | EntityIdSelector | undefined;
  entityQuery?: EntityQuery | EntityQuerySelector;
  entityType: EntityType | EntityTypeSelector;
  fetchType?: FetchType;
  loadingAndErrorWrapper?: boolean;
  LoadingAndErrorWrapper?: ComponentType<LoadingAndErrorWrapperProps>;
  reload?: boolean;
  requestType?: RequestType;
  selectorName?: "getObject" | "getObjectUnfiltered";
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
export function EntityObjectLoader<Entity, EntityWrapper>({
  ComposedComponent,
  entityAlias,
  entityId: entityIdProp,
  entityQuery: entityQueryProp,
  entityType: entityTypeProp,
  fetchType = "fetch",
  loadingAndErrorWrapper = true,
  LoadingAndErrorWrapper = DefaultLoadingAndErrorWrapper,
  reload = false,
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
    isFetching,
    refetch,
  } = useGetQuery(entityId != null ? finalQuery : skipToken, {
    refetchOnMountOrArgChange: reload,
  });

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
    if (isFetching) {
      // @ts-expect-error - invalid typings in redux-actions package
      dispatch(setRequestLoading(requestStatePath, queryKey));
    }
  }, [dispatch, isFetching, requestStatePath, queryKey]);

  useEffect(() => {
    if (rtkError) {
      // @ts-expect-error - invalid typings in redux-actions package
      dispatch(setRequestError(requestStatePath, queryKey, rtkError));
    }
  }, [dispatch, rtkError, requestStatePath, queryKey]);

  useEffect(() => {
    if (data) {
      const transformed = transformResponse(data, finalQuery);
      const normalized = entityDefinition.normalize(transformed);

      dispatch({ type: action, payload: normalized });

      // NOTE Atte Keinänen 8/23/17:
      // Dispatch `setRequestLoaded` after clearing the call stack because we want to the actual data to be updated
      // before we notify components via `state.requests.fetches` that fetching the data is completed
      // @ts-expect-error - invalid typings in redux-actions package
      setTimeout(() => dispatch(setRequestLoaded(requestStatePath, queryKey)));
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
    return match(selectorName)
      .with("getObject", () => {
        return entityDefinition.selectors.getObject(state, entityOptions);
      })
      .with("getObjectUnfiltered", () => {
        return entityDefinition.selectors.getObjectUnfiltered(
          state,
          entityOptions,
        );
      })
      .exhaustive();
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

  const children = (
    <ComposedComponent
      {...actionCreators}
      {...props}
      {...{
        [entityAlias || entityDefinition.nameOne]: wrappedObject,
      }}
      dispatch={dispatch}
      error={error}
      fetched={fetched}
      loading={loading || isFetching}
      object={wrappedObject}
      reload={refetch}
    />
  );

  if (loadingAndErrorWrapper) {
    return (
      <LoadingAndErrorWrapper
        loading={!fetched && entityId != null}
        error={error}
        noWrapper
      >
        {children}
      </LoadingAndErrorWrapper>
    );
  }

  return children;
}

/**
 * @deprecated HOCs are deprecated
 */
export const entityObjectLoader =
  <Entity, EntityWrapper>(eolProps: any) =>
  (
    ComposedComponent: (
      props: ChildrenProps<Entity, EntityWrapper>,
    ) => ReactNode,
  ) =>
    function EntityObjectLoaderWrapper(props: any) {
      return (
        <EntityObjectLoader
          ComposedComponent={ComposedComponent}
          {...props}
          {...eolProps}
        />
      );
    };
