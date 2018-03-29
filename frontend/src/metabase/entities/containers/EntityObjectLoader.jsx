/* @flow */

import React from "react";
import { connect } from "react-redux";

import entityType from "./EntityType";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

@entityType()
@connect((state, { entityDef, entityId }) => ({
  object: entityDef.selectors.getObject(state, { entityId }),
  loading: entityDef.selectors.getLoading(state, { entityId }),
  error: entityDef.selectors.getError(state, { entityId }),
}))
export default class EntitiesObjectLoader extends React.Component {
  static defaultProps = {
    loadingAndErrorWrapper: true,
  };
  componentWillMount() {
    const { entityId, fetch } = this.props;
    fetch({ id: entityId });
  }
  componentWillReceiveProps({ entityId, fetch }) {
    if (entityId !== this.props.entityId) {
      fetch({ id: entityId });
    }
  }
  renderChildren = () => {
    const { children, object, loading, error } = this.props;
    return children({ object, loading, error, remove: this._remove });
  };
  render() {
    const { loading, error, loadingAndErrorWrapper } = this.props;
    return loadingAndErrorWrapper ? (
      <LoadingAndErrorWrapper
        loading={loading}
        error={error}
        children={this.renderChildren}
      />
    ) : (
      this.renderChildren()
    );
  }

  _remove = () => {
    const { object } = this.props;
    return this.props.delete(object);
  };
}
