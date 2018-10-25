/* @flow */

import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

export default (entityType?: string) => (
  ComposedComponent: Class<React$Component<*, *, *>>,
) => {
  const mapStateToProps = (state, props) => ({
    entityDef:
      props.entityDef ||
      // dynamic require due to dependency load order issues
      require("metabase/entities")[entityType || props.entityType],
  });
  return connect(mapStateToProps)(
    class extends React.Component {
      static displayName = "EntityType";

      _boundActionCreators: { [key: string]: Function } = {};

      constructor(props) {
        super(props);
        this._bindActionCreators(props);
      }

      componentWillReceiveProps(nextProps) {
        if (
          nextProps.entityDef !== this.props.entityDef ||
          nextProps.dispatch !== this.props.dispatch
        ) {
          this._bindActionCreators(nextProps);
          this.forceUpdate();
        }
      }

      _bindActionCreators({ entityDef, dispatch }) {
        this._boundActionCreators = bindActionCreators(
          entityDef.actions,
          dispatch,
        );
      }

      render() {
        return (
          <ComposedComponent {...this._boundActionCreators} {...this.props} />
        );
      }
    },
  );
};
