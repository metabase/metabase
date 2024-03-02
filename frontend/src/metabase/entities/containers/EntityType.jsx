/* eslint-disable react/prop-types */
import { bindActionCreators } from "@reduxjs/toolkit";
import { Component } from "react";
import { connect } from "react-redux";

/**
 * @deprecated HOCs are deprecated
 */
export default () => ComposedComponent => {
  const mapStateToProps = (state, props) => ({
    entityDef:
      // dynamic require due to dependency load order issues
      require("metabase/entities")[
        typeof props.entityType === "function"
          ? props.entityType(state, props)
          : props.entityType
      ],
  });
  return connect(mapStateToProps)(
    class extends Component {
      static displayName = "EntityType";

      _boundActionCreators = {};

      constructor(props) {
        super(props);
        this._bindActionCreators(props);
      }

      UNSAFE_componentWillReceiveProps(nextProps) {
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
          <ComposedComponent {...this.props} {...this._boundActionCreators} />
        );
      }
    },
  );
};
