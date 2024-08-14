/* eslint-disable react/prop-types */
import { createSelector } from "@reduxjs/toolkit";
import { Component } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import entityType from "./EntityType";

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

const getMemoizedEntityQuery = createSelector(
  (state, entityQuery) => entityQuery,
  entityQuery => entityQuery,
  {
    equalityFn: _.isEqual,
  },
);

class EntityObjectLoaderInner extends Component {
  static defaultProps = {
    fetchType: "fetch",
    requestType: "fetch",
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

  fetch = (query, options) => {
    const fetch = this.props[this.props.fetchType];
    // errors are handled in redux actions
    return fetch(query, options).catch(() => {});
  };

  UNSAFE_componentWillMount() {
    const { entityId, entityQuery, dispatchApiErrorEvent } = this.props;
    if (entityId != null) {
      this.fetch(
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
      this.fetch(
        { id: nextProps.entityId, ...nextProps.entityQuery },
        {
          reload: nextProps.reload,
          properties: nextProps.properties,
          noEvent: !nextProps.dispatchApiErrorEvent,
        },
      );
    }
  }
  renderChildren = () => {
    let { children, entityDef, entityAlias, wrapped, object, ...props } =
      this.props;

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
    return this.fetch(
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
        requestType = "fetch",
        ...props
      },
    ) => {
      if (typeof entityId === "function") {
        entityId = entityId(state, props);
      }
      if (typeof entityQuery === "function") {
        entityQuery = entityQuery(state, props);
      }

      const entityOptions = { entityId, requestType };

      return {
        entityId,
        entityQuery: getMemoizedEntityQuery(state, entityQuery),
        object: entityDef.selectors[selectorName](state, entityOptions),
        fetched: entityDef.selectors.getFetched(state, entityOptions),
        loading: entityDef.selectors.getLoading(state, entityOptions),
        error: entityDef.selectors.getError(state, entityOptions),
      };
    },
  ),
)(EntityObjectLoaderInner);

export default EntityObjectLoader;

/**
 * @deprecated HOCs are deprecated
 */
export const entityObjectLoader =
  eolProps =>
  ComposedComponent =>
  // eslint-disable-next-line react/display-name
  props =>
    (
      <EntityObjectLoader {...props} {...eolProps}>
        {childProps => (
          <ComposedComponent
            {..._.omit(props, ...CONSUMED_PROPS)}
            {...childProps}
          />
        )}
      </EntityObjectLoader>
    );
