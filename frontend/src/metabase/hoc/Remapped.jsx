/* eslint-disable react/prop-types */
import { Component } from "react";

import { connect } from "metabase/lib/redux";
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
export default (ComposedComponent) =>
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
          this.props.fetchRemapping({
            parameter: this.props.parameter,
            value: this.props.value,
            field: this.props.column,
            cardId: this.props.cardId,
            dashboardId: this.props.dashboardId,
          });
        }
      }
      UNSAFE_componentWillReceiveProps(nextProps) {
        if (
          nextProps.column &&
          (this.props.value !== nextProps.value ||
            this.props.column?.id !== nextProps.column.id ||
            this.props.parameter?.id !== nextProps.parameter?.id ||
            this.props.cardId !== nextProps.cardId ||
            this.props.dashboardId !== nextProps.dashboardId)
        ) {
          this.props.fetchRemapping({
            parameter: nextProps.parameter,
            value: nextProps.value,
            field: this.props.column,
            cardId: nextProps.cardId,
            dashboardId: nextProps.dashboardId,
          });
        }
      }

      render() {
        const { metadata, fetchRemapping, ...props } = this.props;
        const field = props.column;
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
