/* @flow */

import React from "react";
import { connect } from "react-redux";

import entityType from "./EntityType";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

@entityType()
@connect((state, { entityDef }) => ({
  list: entityDef.selectors.getList(state, {}),
  loading: entityDef.selectors.getLoading(state, {}),
  error: entityDef.selectors.getError(state, {}),
}))
export default class EntitiesListLoader extends React.Component {
  static defaultProps = {
    loadingAndErrorWrapper: true,
  };
  componentWillMount() {
    this.props.fetchList();
  }
  renderChildren = () => {
    const { children, list, loading, error } = this.props;
    return children({ list, loading, error });
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
}
