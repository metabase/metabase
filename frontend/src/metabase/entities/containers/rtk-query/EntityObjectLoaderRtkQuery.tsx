import { bindActionCreators } from "@reduxjs/toolkit";
import { useMemo, type ComponentType, type ReactNode } from "react";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";

import DefaultLoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

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

export interface Props {
  children: (props: ChildrenProps) => ReactNode;
  dispatchApiErrorEvent?: boolean;
  entityAlias?: string;
  entityId: EntityId | EntityIdSelector;
  entityQuery: EntityQuery | EntityQuerySelector;
  entityType: EntityType | EntityTypeSelector;
  fetchType?: FetchType;
  loadingAndErrorWrapper?: boolean;
  LoadingAndErrorWrapper: ComponentType<{
    children: ReactNode;
    loading?: boolean;
    error?: unknown;
    noWrapper?: boolean;
  }>;
  reload?: boolean;
  // reloadInterval?: (state: State, props: unknown) => number;
  requestType?: RequestType;
  selectorName?: string;
  wrapped?: boolean;
}

export const EntityObjectLoaderRtkQuery = ({
  children,
  // dispatchApiErrorEvent = true,
  entityAlias,
  entityId: entityIdProp,
  entityQuery: entityQueryProp,
  entityType: entityTypeProp,
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

  const wrappedObject = useMemo(() => {
    if (!wrapped) {
      return object;
    }

    return object && entityDef.wrapEntity(object, dispatch);
  }, [dispatch, object, entityDef, wrapped]);

  const childrenProps = {
    ...actionCreators,
    entityId,
    entityQuery: memoizedEntityQuery,
    object,
    fetched,
    loading,
    error,
  };

  const reload = () => {};
  const remove = () => {};

  const renderedChildren = children({
    ..._.omit(props, ...CONSUMED_PROPS),
    object: wrappedObject,
    // alias the entities name:
    [entityAlias || entityDef.nameOne]: object,
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
        {childProps => (
          <ComposedComponent
            {..._.omit(props, ...CONSUMED_PROPS)}
            {...childProps}
          />
        )}
      </EntityObjectLoaderRtkQuery>
    );
