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
      const fields = columns.map(column => metadata.field(column.id));
      let displayValue, displayColumn;
      if (shouldRemap(fields)) {
        const [field] = fields;
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

export function shouldRemap(fields) {
  const remappedFields = fields.map(field => field.remappedField() || field);
  return new Set(remappedFields.map(f => f.id)).size === 1;
}
