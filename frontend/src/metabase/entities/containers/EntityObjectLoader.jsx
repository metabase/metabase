/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { createSelector } from "reselect";
import _ from "underscore";

import entityType from "./EntityType";
import { createMemoizedSelector } from "metabase/lib/redux";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

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
];

// NOTE: Memoize entityQuery so we don't re-render even if a new but identical
// object is created. This works because entityQuery must be JSON serializable
const getMemoizedEntityQuery = createMemoizedSelector(
  (state, entityQuery) => entityQuery,
  entityQuery => entityQuery,
);

class EntityObjectLoaderInner extends React.Component {
  static defaultProps = {
    loadingAndErrorWrapper: true,
    LoadingAndErrorWrapper: LoadingAndErrorWrapper,
    reload: false,
    wrapped: false,
    dispatchApiErrorEvent: true,
  };

  _getWrappedObject;

  constructor(props) {
    super(props);

    this._getWrappedObject = createSelector(
      [
        props => props.object,
        props => props.dispatch,
        props => props.entityDef,
      ],
      (object, dispatch, entityDef) =>
        object && entityDef.wrapEntity(object, dispatch),
    );
  }

  UNSAFE_componentWillMount() {
    const { entityId, entityQuery, fetch, dispatchApiErrorEvent } = this.props;
    if (entityId != null) {
      fetch(
        { id: entityId, ...entityQuery },
        {
          reload: this.props.reload,
          properties: this.props.properties,
          noEvent: !dispatchApiErrorEvent,
        },
      );
    }
  }
  UNSAFE_componentWillReceiveProps(nextProps) {
    if (
      nextProps.entityId !== this.props.entityId &&
      nextProps.entityId != null
    ) {
      nextProps.fetch(
        { id: nextProps.entityId, ...nextProps.entityQuery },
        { reload: nextProps.reload, properties: nextProps.properties },
      );
    }
  }
  renderChildren = () => {
    let {
      children,
      entityDef,
      entityAlias,
      wrapped,
      object,
      ...props
    } = this.props; // eslint-disable-line no-unused-vars

    if (wrapped) {
      object = this._getWrappedObject(this.props);
    }

    return children({
      ..._.omit(props, ...CONSUMED_PROPS),
      object,
      // alias the entities name:
      [entityAlias || entityDef.nameOne]: object,
      reload: this.reload,
      remove: this.remove,
    });
  };
  render() {
    const {
      entityId,
      fetched,
      error,
      loadingAndErrorWrapper,
      LoadingAndErrorWrapper,
    } = this.props;

    return loadingAndErrorWrapper ? (
      <LoadingAndErrorWrapper
        loading={!fetched && entityId != null}
        error={error}
        noWrapper
      >
        {this.renderChildren}
      </LoadingAndErrorWrapper>
    ) : (
      this.renderChildren()
    );
  }

  reload = () => {
    return this.props.fetch(
      { id: this.props.entityId },
      {
        reload: true,
        properties: this.props.properties,
        noEvent: !this.props.dispatchApiErrorEvent,
      },
    );
  };

  remove = () => {
    return this.props.delete(this.props.object);
  };
}

const EntityObjectLoader = _.compose(
  entityType(),
  connect(
    (
      state,
      {
        entityDef,
        entityId,
        entityQuery,
        selectorName = "getObject",
        ...props
      },
    ) => {
      if (typeof entityId === "function") {
        entityId = entityId(state, props);
      }
      if (typeof entityQuery === "function") {
        entityQuery = entityQuery(state, props);
      }

      return {
        entityId,
        entityQuery: getMemoizedEntityQuery(state, entityQuery),
        object: entityDef.selectors[selectorName](state, { entityId }),
        fetched: entityDef.selectors.getFetched(state, { entityId }),
        loading: entityDef.selectors.getLoading(state, { entityId }),
        error: entityDef.selectors.getError(state, { entityId }),
      };
    },
  ),
)(EntityObjectLoaderInner);

export default EntityObjectLoader;

export const entityObjectLoader = eolProps =>
  // eslint-disable-line react/display-name
  ComposedComponent =>
    // eslint-disable-next-line react/display-name
    props => (
      <EntityObjectLoader {...props} {...eolProps}>
        {childProps => (
          <ComposedComponent
            {..._.omit(props, ...CONSUMED_PROPS)}
            {...childProps}
          />
        )}
      </EntityObjectLoader>
    );
