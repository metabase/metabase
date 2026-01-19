import { bindActionCreators } from "@reduxjs/toolkit";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import {
  LoadingAndErrorWrapper as DefaultLoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/common/components/LoadingAndErrorWrapper";
import { capitalize } from "metabase/lib/formatting";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setRequestError,
  setRequestLoaded,
  setRequestLoading,
} from "metabase/redux/requests";
import { isObject } from "metabase-types/guards";

import type {
  EntityDefinition,
  EntityListQueryResponse,
  EntityQuery,
  EntityQuerySelector,
  EntityType,
  EntityTypeSelector,
  ListMetadata,
  ReloadInterval,
  ReloadIntervalSelector,
} from "./types";
import { usePaginatedQuery } from "./usePaginatedQuery";

interface ChildrenProps<Entity, EntityWrapper> {
  allError?: unknown;
  allFetched?: boolean;
  allLoaded?: boolean;
  allLoading?: boolean;
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
  total: number | undefined;
}

interface Props<Entity, EntityWrapper> {
  allError?: unknown;
  allFetched?: boolean;
  allLoaded?: boolean;
  allLoading?: boolean;
  ComposedComponent: (props: ChildrenProps<Entity, EntityWrapper>) => ReactNode;
  entityQuery?: EntityQuery | EntityQuerySelector;
  entityType: EntityType | EntityTypeSelector;
  initialPage?: number;
  listName?: string;
  loadingAndErrorWrapper?: boolean;
  LoadingAndErrorWrapper?: ComponentType<LoadingAndErrorWrapperProps>;
  pageSize?: number;
  reload?: boolean | ChildrenProps<Entity, EntityWrapper>["reload"]; // reload can be passed as a callback from the outer loader
  reloadInterval?: ReloadInterval | ReloadIntervalSelector<Entity>;
  selectorName?: "getList" | "getListUnfiltered";
  wrapped?: boolean;
}

const transformResponse = <Entity extends object>(
  fetched: EntityListQueryResponse<Entity>,
) => {
  if (!isObject(fetched) || !fetched.data) {
    return { results: fetched, metadata: {} };
  }

  const { data, ...metadata } = fetched;
  return { results: data, metadata };
};

const isPaginationMetadata = (
  value: Record<string, unknown>,
): value is { limit: number; offset: number; total: number } => {
  return (
    typeof value.limit === "number" &&
    typeof value.offset === "number" &&
    typeof value.total === "number"
  );
};

/**
 * Difference between the 2 generic types, using Database entity as an example:
 *   Entity        -> Database from metabase-types/api/database.ts
 *   EntityWrapper -> Database from metabase-lib/v1/metadata/Database.ts
 *
 * @deprecated use "metabase/api" instead
 */
export function EntityListLoader<Entity, EntityWrapper>({
  allError: allErrorProp,
  allFetched: allFetchedProp,
  allLoaded: allLoadedProp,
  allLoading: allLoadingProp,
  ComposedComponent,
  entityQuery: entityQueryProp,
  entityType: entityTypeProp,
  initialPage,
  listName,
  loadingAndErrorWrapper = true,
  LoadingAndErrorWrapper = DefaultLoadingAndErrorWrapper,
  pageSize,
  reload = false,
  reloadInterval: reloadIntervalProp,
  selectorName = "getList",
  wrapped = false,
  ...props
}: Props<Entity, EntityWrapper>) {
  const dispatch = useDispatch();

  const entityType = useSelector((state) =>
    typeof entityTypeProp === "function"
      ? entityTypeProp(state, props)
      : entityTypeProp,
  );

  const entityDefinition: EntityDefinition<Entity, EntityWrapper> =
    useMemo(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require due to circular dependencies
      const entitiesDefinitions = require("metabase/entities");
      return entitiesDefinitions[entityType];
    }, [entityType]);

  const nonPaginatedEntityQuery = useSelector(
    (state) =>
      typeof entityQueryProp === "function"
        ? entityQueryProp(state, props)
        : entityQueryProp,
    _.isEqual,
  );

  const {
    entityQuery,
    hasMorePages,
    isPaginated,
    page,
    onNextPage,
    onPreviousPage,
    setHasMorePages,
  } = usePaginatedQuery(nonPaginatedEntityQuery, pageSize, initialPage);
  const paginationProps = isPaginated
    ? {
        hasMorePages,
        page,
        pageSize,
        onNextPage,
        onPreviousPage,
      }
    : undefined;

  const entityOptions = useMemo(() => ({ entityQuery }), [entityQuery]);

  const list = useSelector((state) => {
    return match(selectorName)
      .with("getList", () => {
        return entityDefinition.selectors.getList(state, entityOptions);
      })
      .with("getListUnfiltered", () => {
        return entityDefinition.selectors.getListUnfiltered(
          state,
          entityOptions,
        );
      })
      .exhaustive();
  });

  const fetched = useSelector((state) => {
    const value = entityDefinition.selectors.getFetched(state, entityOptions);
    return Boolean(value);
  });

  const loaded = useSelector((state) => {
    const value = entityDefinition.selectors.getLoaded(state, entityOptions);
    return Boolean(value);
  });

  const loading = useSelector((state) => {
    const value = entityDefinition.selectors.getLoading(state, entityOptions);
    return Boolean(value);
  });

  const error = useSelector((state) => {
    return entityDefinition.selectors.getError(state, entityOptions);
  });

  const metadata = useSelector((state) => {
    return entityDefinition.selectors.getListMetadata(state, entityOptions);
  });

  const wrappedList = useMemo(() => {
    if (!wrapped || !list) {
      return list;
    }

    return list.map((object) => entityDefinition.wrapEntity(object, dispatch));
  }, [dispatch, list, entityDefinition, wrapped]);

  const reloadInterval = useSelector((state) => {
    if (typeof reloadIntervalProp === "function") {
      return reloadIntervalProp(state, props, list);
    }
    return reloadIntervalProp;
  });

  const {
    data,
    error: rtkError,
    isFetching,
    isLoading,
    refetch,
  } = entityDefinition.rtk.useListQuery(entityQuery, {
    pollingInterval: reloadInterval,
    refetchOnMountOrArgChange: reload === true,
  });

  const queryKey = useMemo(
    () => entityDefinition.getQueryKey(entityQuery),
    [entityDefinition, entityQuery],
  );

  const listStatePath = useMemo(() => {
    return entityDefinition.getListStatePath(entityQuery);
  }, [entityDefinition, entityQuery]);

  const requestStatePath = useMemo(() => {
    return [...listStatePath, "fetch"];
  }, [listStatePath]);

  useEffect(() => {
    if (isFetching) {
      dispatch(setRequestLoading(requestStatePath, queryKey));
    }
  }, [dispatch, isFetching, requestStatePath, queryKey]);

  useEffect(() => {
    if (rtkError) {
      dispatch(setRequestError(requestStatePath, queryKey, rtkError));
    }
  }, [dispatch, rtkError, requestStatePath, queryKey]);

  useEffect(() => {
    if (data && !isFetching) {
      const { results, metadata } = transformResponse(data);

      if (isPaginationMetadata(metadata)) {
        setHasMorePages(metadata.offset + metadata.limit < metadata.total);
      }

      if (!Array.isArray(results)) {
        throw new Error(`Invalid response listing ${entityDefinition.name}`);
      }

      const normalized = entityDefinition.normalizeList(results);

      const result = {
        ...normalized,
        metadata,
        entityQuery,
      };

      dispatch({
        type: entityDefinition.actionTypes.FETCH_LIST,
        payload: result,
      });

      // NOTE Atte Keinänen 8/23/17:
      // Dispatch `setRequestLoaded` after clearing the call stack because we want to the actual data to be updated
      // before we notify components via `state.requests.fetches` that fetching the data is completed
      setTimeout(() => dispatch(setRequestLoaded(requestStatePath, queryKey)));
    }
  }, [
    dispatch,
    data,
    entityDefinition,
    entityQuery,
    isFetching,
    requestStatePath,
    queryKey,
    setHasMorePages,
  ]);

  // merge props passed in from stacked Entity*Loaders:
  const allError = error || (allErrorProp ?? null);
  const allFetched = fetched && (allFetchedProp ?? true);
  const allLoaded = loaded && (allLoadedProp ?? true);
  const allLoading = loading || (allLoadingProp ?? false);
  const finalListName = listName || entityDefinition.nameMany;
  const total = Array.isArray(data) ? undefined : data?.total;

  const actionCreators = useMemo(() => {
    return bindActionCreators(entityDefinition.actions, dispatch);
  }, [entityDefinition.actions, dispatch]);

  const children = (
    <ComposedComponent
      {...actionCreators}
      {...paginationProps}
      {...props}
      {...{
        [finalListName]: wrappedList,
        [`reload${capitalize(finalListName)}`]: refetch,
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
      total={total}
    />
  );

  if (loadingAndErrorWrapper) {
    return (
      <LoadingAndErrorWrapper
        loading={!allFetched || isLoading}
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
export const entityListLoader =
  <Entity, EntityWrapper>(eolProps: any) =>
  (
    ComposedComponent: (
      props: ChildrenProps<Entity, EntityWrapper>,
    ) => ReactNode,
  ) =>
    function EntityListLoaderWrapper(props: any) {
      return (
        <EntityListLoader
          ComposedComponent={ComposedComponent}
          {...props}
          {...eolProps}
        />
      );
    };
