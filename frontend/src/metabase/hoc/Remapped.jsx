import React, { Component } from "react";
import { connect } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import { fetchRemapping } from "metabase/redux/metadata";

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

const mapDispatchToProps = {
  fetchRemapping,
};

export default ComposedComponent =>
  @connect(mapStateToProps, mapDispatchToProps)
  class extends Component {
    static displayName = "Remapped[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    componentWillMount() {
      if (this.props.column) {
        this.props.fetchRemapping(this.props.value, this.props.column.id);
      }
    }
    componentWillReceiveProps(nextProps) {
      if (
        nextProps.column &&
        (this.props.value !== nextProps.value ||
          this.props.column !== nextProps.column)
      ) {
        this.props.fetchRemapping(nextProps.value, nextProps.column.id);
      }
    }

    render() {
      // eslint-disable-next-line no-unused-vars
      const { metadata, fetchRemapping, ...props } = this.props;
      const field = metadata.field(props.column && props.column.id);
      const displayValue = field && field.remappedValue(props.value);
      const displayColumn =
        (displayValue != null && field && field.remappedField()) || null;
      return (
        <ComposedComponent
          {...props}
          displayValue={displayValue}
          displayColumn={displayColumn}
        />
      );
    }
  };
