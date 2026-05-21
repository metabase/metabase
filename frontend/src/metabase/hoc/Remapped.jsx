/* eslint-disable react/prop-types */
import { Component } from "react";

import { connect } from "metabase/redux";
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
// eslint-disable-next-line import/no-default-export -- deprecated usage
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

      state = { remapping: null };

      UNSAFE_componentWillMount() {
        this.fetchRemapping(this.props);
      }

      UNSAFE_componentWillReceiveProps(nextProps) {
        if (
          this.props.value !== nextProps.value ||
          this.props.column?.id !== nextProps.column?.id ||
          this.props.parameter?.id !== nextProps.parameter?.id ||
          this.props.cardId !== nextProps.cardId ||
          this.props.dashboardId !== nextProps.dashboardId ||
          this.props.uuid !== nextProps.uuid ||
          this.props.token !== nextProps.token
        ) {
          this.setState({ remapping: null });
          this.fetchRemapping(nextProps);
        }
      }

      async fetchRemapping(props) {
        const result = await props.fetchRemapping({
          parameter: props.parameter,
          value: props.value,
          field: props.column,
          cardId: props.cardId,
          dashboardId: props.dashboardId,
          uuid: props.uuid,
          token: props.token,
        });

        const remapping = result?.payload;
        if (remapping != null && props.value === this.props.value) {
          this.setState({ remapping });
        }
      }

      getDisplayValue(field, value) {
        const fieldDisplayValue = field && field.remappedValue(value);
        if (fieldDisplayValue != null) {
          return fieldDisplayValue;
        }

        const [, remappedLabel] = this.state.remapping ?? [];
        if (remappedLabel != null) {
          return remappedLabel;
        }

        return null;
      }

      render() {
        const { metadata, fetchRemapping, ...props } = this.props;
        // Read the field from metadata so we pick up remappings stored
        // asynchronously by fetchRemapping (e.g. card/question label columns);
        // the column passed in props can be a stale instance.
        const field =
          (props.column?.id != null && metadata?.field(props.column.id)) ||
          props.column;
        const displayValue = this.getDisplayValue(field, props.value);
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
