import React from "react";
import { connect } from "react-redux";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import entityType from "./EntityType";

@entityType()
@connect((state, { entityId, entityDef }) => ({
  object: entityDef.selectors.getObject(state, { entityId }),
  loading: entityDef.selectors.getLoading(state, {
    entityId,
    requestType: "fetch",
  }),
  error: entityDef.selectors.getError(state, {
    entityId,
    requestType: "fetch",
  }),
}))
export default class EntitiesObjectLoader extends React.Component {
  static defaultProps = {
    loadingAndErrorWrapper: true,
  };
  componentWillMount() {
    this.props.fetch({ id: this.props.entityId });
  }
  remove = () => {
    const { object } = this.props;
    return this.props.delete(object);
  };
  renderChildren = () => {
    const { object, loading, error, children } = this.props;
    return children({ object, loading, error, remove: this.remove });
  };
  render() {
    const { loadingAndErrorWrapper, loading, error } = this.props;
    if (loadingAndErrorWrapper) {
      return (
        <LoadingAndErrorWrapper
          loading={loading}
          error={error}
          children={this.renderChildren}
        />
      );
    } else {
      this.renderChildren();
    }
  }
}
