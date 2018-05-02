/* @flow */

import React from "react";
import { connect } from "react-redux";

import entityType from "./EntityType";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

export type Props = {
  entityType?: string,
  loadingAndErrorWrapper: boolean,
  children: (props: RenderProps) => ?React$Element<any>,
};

export type RenderProps = {
  list: ?(any[]),
  loading: boolean,
  error: ?any,
};

@entityType()
@connect((state, { entityDef }) => ({
  list: entityDef.selectors.getList(state, {}),
  loading: entityDef.selectors.getLoading(state, {}),
  error: entityDef.selectors.getError(state, {}),
}))
export default class EntitiesListLoader extends React.Component {
  props: Props;

  static defaultProps = {
    loadingAndErrorWrapper: true,
  };

  componentWillMount() {
    // $FlowFixMe: provided by @connect
    this.props.fetchList();
  }
  renderChildren = () => {
    // $FlowFixMe: provided by @connect
    const { children, list, loading, error } = this.props;
    return children({ list, loading, error });
  };
  render() {
    // $FlowFixMe: provided by @connect
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
