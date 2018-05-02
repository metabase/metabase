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
  object: ?any,
  loading: boolean,
  error: ?any,
  remove: () => Promise<void>,
};

@entityType()
@connect((state, { entityDef, entityId }) => ({
  object: entityDef.selectors.getObject(state, { entityId }),
  loading: entityDef.selectors.getLoading(state, { entityId }),
  error: entityDef.selectors.getError(state, { entityId }),
}))
export default class EntitiesObjectLoader extends React.Component {
  props: Props;

  static defaultProps = {
    loadingAndErrorWrapper: true,
  };

  componentWillMount() {
    // $FlowFixMe: provided by @connect
    const { entityId, fetch } = this.props;
    fetch({ id: entityId });
  }
  componentWillReceiveProps(nextProps: Props) {
    // $FlowFixMe: provided by @connect
    if (nextProps.entityId !== this.props.entityId) {
      nextProps.fetch({ id: nextProps.entityId });
    }
  }
  renderChildren = () => {
    // $FlowFixMe: provided by @connect
    const { children, object, loading, error } = this.props;
    return children({ object, loading, error, remove: this._remove });
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

  _remove = () => {
    // $FlowFixMe: provided by @connect
    return this.props.delete(this.props.object);
  };
}
