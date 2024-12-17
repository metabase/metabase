import { bindActionCreators } from "@reduxjs/toolkit";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { match } from "ts-pattern";

import DefaultLoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setRequestError,
  setRequestLoaded,
  setRequestLoading,
} from "metabase/redux/requests";

import type {
  EntityDefinition,
  EntityQuery,
  EntityQuerySelector,
  EntityType,
  EntityTypeSelector,
  FetchType,
  ListMetadata,
} from "./types";

interface ChildrenProps<Entity, EntityWrapper> {
  allError?: unknown;
  allFetched?: boolean;
  allLoaded?: boolean;
  allLoading?: boolean;
  // dispatch: Dispatch;
  // dispatchApiErrorEvent: boolean;
  entityQuery: EntityQuery;
  error: unknown;
  fetched: boolean;
  loaded: boolean;
  loading: boolean;
  /**
   * list item is EntityWrapper when Props["wrapped"] is true
   */
  list: EntityWrapper[] | Entity[] | undefined;
  metadata: ListMetadata | undefined;
  reload: () => void;
}

interface LoadingAndErrorWrapperProps {
  children: ReactNode;
  loading?: boolean;
  error?: unknown;
  noWrapper?: boolean;
}

interface Props<Entity, EntityWrapper> {
  allError?: unknown;
  allFetched?: boolean;
  allLoaded?: boolean;
  allLoading?: boolean;
  ComposedComponent: (props: ChildrenProps<Entity, EntityWrapper>) => ReactNode;
  dispatchApiErrorEvent?: boolean;
  entityAlias?: string;
  entityQuery?: EntityQuery | EntityQuerySelector;
  entityType: EntityType | EntityTypeSelector;
  fetchType?: FetchType;
  loadingAndErrorWrapper?: boolean;
  LoadingAndErrorWrapper?: ComponentType<LoadingAndErrorWrapperProps>;
  reload?: boolean;
  selectorName?: "getList" | "getListUnfiltered";
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
export function EntityListLoaderRtkQuery<Entity, EntityWrapper>({
  allError: allErrorProp,
  allFetched: allFetchedProp,
  allLoaded: allLoadedProp,
  allLoading: allLoadingProp,
  ComposedComponent,
  dispatchApiErrorEvent = true,
  entityAlias,
  entityQuery: entityQueryProp,
  entityType: entityTypeProp,
  fetchType = "fetch",
  loadingAndErrorWrapper = true,
  LoadingAndErrorWrapper = DefaultLoadingAndErrorWrapper,
  reload = false,
  selectorName = "getList",
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

  const entityQuery = useSelector(state =>
    typeof entityQueryProp === "function"
      ? entityQueryProp(state, props)
      : entityQueryProp,
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
  } = useGetQuery(entityQuery, {
    refetchOnMountOrArgChange: reload,
  });

  const queryKey = useMemo(
    () => entityDefinition.getQueryKey(entityQuery),
    [entityDefinition, entityQuery],
  );

  // const objectStatePath = useMemo(() => {
  //   if (!entityId) {
  //     return [];
  //   }

  //   return entityDefinition.getObjectStatePath(entityId);
  // }, [entityDefinition, entityId]);

  // const requestStatePath = useMemo(() => {
  //   return [...objectStatePath, requestType];
  // }, [objectStatePath, requestType]);

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
      const transformed = transformResponse(data, entityQuery);
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
    entityQuery,
    transformResponse,
    requestStatePath,
    queryKey,
  ]);

  const list = useSelector(state => {
    return match(selectorName)
      .with("getList", () => {
        return entityDefinition.selectors.getList(state, { entityQuery });
      })
      .with("getListUnfiltered", () => {
        return entityDefinition.selectors.getListUnfiltered(state, {
          entityQuery,
        });
      })
      .exhaustive();
  });

  const fetched = useSelector(state => {
    const value = entityDefinition.selectors.getFetched(state, { entityQuery });
    return Boolean(value);
  });

  const loaded = useSelector(state => {
    const value = entityDefinition.selectors.getLoaded(state, { entityQuery });
    return Boolean(value);
  });

  const loading = useSelector(state => {
    const value = entityDefinition.selectors.getLoading(state, { entityQuery });
    return Boolean(value);
  });

  const error = useSelector(state => {
    return entityDefinition.selectors.getError(state, { entityQuery });
  });

  const metadata = useSelector(state => {
    return entityDefinition.selectors.getListMetadata(state, {
      entityQuery,
    });
  });

  const actionCreators = useMemo(() => {
    return bindActionCreators(entityDefinition.actions, dispatch);
  }, [entityDefinition.actions, dispatch]);

  const wrappedList = useMemo(() => {
    if (!wrapped || !list) {
      return list;
    }

    return list.map(object => entityDefinition.wrapEntity(object, dispatch));
  }, [dispatch, list, entityDefinition, wrapped]);

  // merge props passed in from stacked Entity*Loaders:
  const allError = error || (allErrorProp == null ? null : allErrorProp);
  const allFetched =
    fetched && (allFetchedProp == null ? true : allFetchedProp);
  const allLoaded = loaded && (allLoadedProp == null ? true : allLoadedProp);
  const allLoading =
    loading || (allLoadingProp == null ? false : allLoadingProp);

  const children = (
    <ComposedComponent
      {...actionCreators}
      {...props}
      {...{
        [entityAlias || entityDefinition.nameOne]: wrappedList,
      }}
      allError={allError}
      allFetched={allFetched}
      allLoaded={allLoaded}
      allLoading={allLoading}
      entityQuery={entityQuery}
      error={error}
      fetched={fetched}
      list={wrappedList}
      loaded={loaded}
      loading={loading || isFetching}
      metadata={metadata}
      reload={refetch}
    />
  );

  if (loadingAndErrorWrapper) {
    return (
      <LoadingAndErrorWrapper
        loading={!allFetched || isFetching}
        error={allError}
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
export const entityListLoaderRtkQuery =
  (eolProps: any) =>
  (ComposedComponent: (props: any) => ReactNode) =>
  // eslint-disable-next-line react/display-name
  (props: any): ReactNode => (
    <EntityListLoaderRtkQuery
      ComposedComponent={ComposedComponent}
      {...props}
      {...eolProps}
    />
  );
