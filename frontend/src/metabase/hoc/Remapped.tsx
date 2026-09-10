import { Component, type ComponentType } from "react";

import { fetchRemapping, getRemappedFieldValue } from "metabase/metadata-store";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getRemappedField } from "metabase-lib/v1/metadata/utils/remapping";
import type { ParameterField } from "metabase-lib/v1/parameters/types";

type Remapping = [value: unknown, label: unknown];

interface RemappedOwnProps {
  value?: unknown;
  column?: ParameterField;
  parameter?: { id?: unknown };
  cardId?: unknown;
  dashboardId?: unknown;
  uuid?: unknown;
  token?: unknown;
}

interface RemappedStateProps {
  // the label the store already holds for this value, if any
  remappedValue: string | undefined;
}

interface RemappedDispatchProps {
  // The connect-bound form of `fetchRemapping`; the thunk resolves to its payload.
  fetchRemapping: (args: {
    parameter?: { id?: unknown };
    value?: unknown;
    field?: ParameterField;
    cardId?: unknown;
    dashboardId?: unknown;
    uuid?: unknown;
    token?: unknown;
  }) => Promise<{ payload?: Remapping } | undefined>;
}

type RemappedClassProps = RemappedOwnProps &
  RemappedStateProps &
  RemappedDispatchProps;

const mapStateToProps = (
  state: State,
  { column, value }: RemappedOwnProps,
): RemappedStateProps => ({
  remappedValue:
    column == null ? undefined : getRemappedFieldValue(state, column, value),
});

const mapDispatchToProps = {
  fetchRemapping,
};

/**
 * @deprecated HOCs are deprecated
 */
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default (ComposedComponent: ComponentType<any>) => {
  class RemappedComponent extends Component<
    RemappedClassProps,
    { remapping: Remapping | null }
  > {
    static displayName =
      "Remapped[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    state: { remapping: Remapping | null } = { remapping: null };

    UNSAFE_componentWillMount() {
      this.fetchRemapping(this.props);
    }

    UNSAFE_componentWillReceiveProps(nextProps: RemappedClassProps) {
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

    async fetchRemapping(props: RemappedClassProps) {
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

    getDisplayValue() {
      if (this.props.remappedValue != null) {
        return this.props.remappedValue;
      }

      const [, remappedLabel] = this.state.remapping ?? [];
      if (remappedLabel != null) {
        return remappedLabel;
      }

      return null;
    }

    render() {
      const {
        remappedValue: _remappedValue,
        fetchRemapping,
        ...props
      } = this.props;
      const displayValue = this.getDisplayValue();
      const displayColumn =
        (displayValue != null &&
          props.column != null &&
          getRemappedField(props.column)) ||
        null;

      return (
        <ComposedComponent
          {...props}
          displayValue={displayValue}
          displayColumn={displayColumn}
        />
      );
    }
  }

  // connect's class-component prop matching can't see through the dynamic
  // passthrough props, so cast around it and keep the public surface permissive.
  return connect(
    mapStateToProps,
    mapDispatchToProps,
    // Unjustified type cast. FIXME
  )(RemappedComponent as ComponentType<any>) as unknown as ComponentType<any>;
};
