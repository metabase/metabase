/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import { fetchRemapping } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

const mapDispatchToProps = {
  fetchRemapping,
};

/**
 * @deprecated HOCs are deprecated
 */
export default ComposedComponent =>
  connect(
    mapStateToProps,
    mapDispatchToProps,
  )(
    class extends Component {
      static displayName =
        "Remapped[" +
        (ComposedComponent.displayName || ComposedComponent.name) +
        "]";

      constructor(props) {
        super(props);
        this.fetchRemappingByProps(props);
      }

      componentDidUpdate(prevProps) {
        if (
          this.props.column &&
          (prevProps.value !== this.props.value ||
            prevProps.column !== this.props.column)
        ) {
          this.fetchRemappingByProps(this.props);
        }
      }

      fetchRemappingByProps(props) {
        if (props.column) {
          props.fetchRemapping(props.value, props.column.id);
        }
      }

      render() {
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
    },
  );
