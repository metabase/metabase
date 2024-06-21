import { bindActionCreators } from "@reduxjs/toolkit";
import { useMemo, type ComponentType, type ReactNode } from "react";
import _ from "underscore";

import { skipToken } from "metabase/api";
import DefaultLoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";

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

// props that shouldn't be passed to children in order to properly stack
const CONSUMED_PROPS = [
  "entityType",
  "entityId",
  "entityQuery",
  "entityAlias",
  // "reload", // Masked by `reload` function. Should we rename that?
  "wrapped",
  "properties",
  "loadingAndErrorWrapper",
  "LoadingAndErrorWrapper",
  "selectorName",
  "requestType",
  "fetchType",
];

interface ChildrenProps {}

interface LoadingAndErrorWrapperProps {
  children: ReactNode;
  loading?: boolean;
  error?: unknown;
  noWrapper?: boolean;
}

export interface Props {
  children: (props: ChildrenProps) => ReactNode;
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

export const EntityObjectLoaderRtkQuery = ({
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
}: Props) => {
  const dispatch = useDispatch();

  const entityType = useSelector(state =>
    typeof entityTypeProp === "function"
      ? entityTypeProp(state, props)
      : entityTypeProp,
  );

  const entityDefinition: EntityDefinition = useMemo(() => {
    // dynamic require due to circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const entitiesDefinitions = require("metabase/entities");
    return entitiesDefinitions[entityType];
  }, [entityType]);

  const { useGetQuery } = entityDefinition.rtk;

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

  useGetQuery(entityId != null ? { id: entityId, ...entityQuery } : skipToken);

  const entityOptions = useMemo(
    () => ({ entityId, requestType }),
    [entityId, requestType],
  );

  const object = useSelector(state => {
    return entityDefinition.selectors[selectorName](state, entityOptions);
  });

  const fetched = useSelector(state => {
    return entityDefinition.selectors.getFetched(state, entityOptions);
  });

  const loading = useSelector(state => {
    return entityDefinition.selectors.getLoading(state, entityOptions);
  });

  const error = useSelector(state => {
    return entityDefinition.selectors.getError(state, entityOptions);
  });

  const memoizedEntityQuery = useSelector(() => entityQuery, _.isEqual);

  const actionCreators = useMemo(() => {
    return bindActionCreators(entityDefinition.actions, dispatch);
  }, [entityDefinition.actions, dispatch]);

  // const normalizedObject = useMemo(() => {
  //   if (!object) {
  //     return object;
  //   }

  //   const normalized = entityDefinition.normalize(object);
  //   return normalized.object;
  // }, [entityDefinition, object]);

  const wrappedObject = useMemo(() => {
    if (!wrapped || !object) {
      return object;
    }

    return entityDefinition.wrapEntity(object, dispatch);
  }, [dispatch, object, entityDefinition, wrapped]);

  const reload = () => {
    /* TODO */
  };

  const remove = () => {
    /* TODO */
  };

  const renderedChildren = children({
    ...actionCreators,
    ...props,
    object: wrappedObject,
    // alias the entities name:
    [entityAlias || entityDefinition.nameOne]: wrappedObject,
    reload,
    remove,
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
};

/**
 * @deprecated HOCs are deprecated
 */
export const entityObjectLoaderRtkQuery =
  (eolProps: any) =>
  (ComposedComponent: (props: any) => ReactNode) =>
  // eslint-disable-next-line react/display-name
  (props: any): ReactNode =>
    (
      <EntityObjectLoaderRtkQuery {...props} {...eolProps}>
        {childProps => <ComposedComponent {...childProps} />}
      </EntityObjectLoaderRtkQuery>
    );
