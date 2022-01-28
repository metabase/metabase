/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { createSelector } from "reselect";
import _ from "underscore";

import entityType from "./EntityType";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

// props that shouldn't be passed to children in order to properly stack
const CONSUMED_PROPS = [
  "entityType",
  "entityId",
  "entityAlias",
  // "reload", // Masked by `reload` function. Should we rename that?
  "wrapped",
  "properties",
  "loadingAndErrorWrapper",
  "selectorName",
];

@entityType()
@connect(
  (state, { entityDef, entityId, selectorName = "getObject", ...props }) => {
    if (typeof entityId === "function") {
      entityId = entityId(state, props);
    }

    return {
      entityId,
      object: entityDef.selectors[selectorName](state, { entityId }),
      fetched: entityDef.selectors.getFetched(state, { entityId }),
      loading: entityDef.selectors.getLoading(state, { entityId }),
      error: entityDef.selectors.getError(state, { entityId }),
    };
  },
)
export default class EntityObjectLoader extends React.Component {
  props;

  static defaultProps = {
    loadingAndErrorWrapper: true,
    reload: false,
    wrapped: false,
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
    const { entityId, fetch } = this.props;
    if (entityId != null) {
      fetch(
        { id: entityId },
        { reload: this.props.reload, properties: this.props.properties },
      );
    }
  }
  UNSAFE_componentWillReceiveProps(nextProps) {
    if (
      nextProps.entityId !== this.props.entityId &&
      nextProps.entityId != null
    ) {
      nextProps.fetch(
        { id: nextProps.entityId },
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
    const { entityId, fetched, error, loadingAndErrorWrapper } = this.props;
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
      { reload: true, properties: this.props.properties },
    );
  };

  remove = () => {
    return this.props.delete(this.props.object);
  };
}

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
