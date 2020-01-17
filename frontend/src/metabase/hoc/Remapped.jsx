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
  @connect(
    mapStateToProps,
    mapDispatchToProps,
  )
  class extends Component {
    static displayName =
      "Remapped[" +
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
      const { metadata, fetchRemapping, columns, ...props } = this.props;
      const [column] = columns;
      let displayValue, displayColumn;
      if (columns.length === 1) {
        // If there is more than one column, don't remap. If multiple columns
        // are remapped to the same column, they were previously merged.
        const field = metadata.field(column.id);
        displayValue = field.remappedValue(props.value);
        displayColumn = (displayValue != null && field.remappedField()) || null;
      }
      return (
        <ComposedComponent
          {...props}
          column={column}
          displayValue={displayValue}
          displayColumn={displayColumn}
        />
      );
    }
  };
