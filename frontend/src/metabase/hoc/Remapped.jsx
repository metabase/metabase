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

      UNSAFE_componentWillMount() {
        if (this.props.column) {
          this.props.fetchRemapping(this.props.value, this.props.column.id);
        }
      }
      UNSAFE_componentWillReceiveProps(nextProps) {
        if (
          nextProps.column &&
          (this.props.value !== nextProps.value ||
            this.props.column !== nextProps.column)
        ) {
          this.props.fetchRemapping(nextProps.value, nextProps.column.id);
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
