import { bindActionCreators } from "@reduxjs/toolkit";
import { useMemo } from "react";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";

import type {
  EntityDefinition,
  EntityId,
  EntityIdSelector,
  EntityQuery,
  EntityQuerySelector,
  EntityType,
  EntityTypeSelector,
  RequestType,
} from "./types";

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

  const childrenProps = {
    ...actionCreators,
    entityId,
    entityQuery: memoizedEntityQuery,
    object,
    fetched,
    loading,
    error,
  };
};
