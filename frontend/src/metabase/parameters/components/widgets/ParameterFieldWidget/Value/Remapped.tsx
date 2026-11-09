import { Component, type ComponentType } from "react";

import { fetchRemapping } from "metabase/metadata-store";
import { connect } from "metabase/redux";
import type * as Lib from "metabase-lib";

type Remapping = [value: unknown, label: unknown];

interface RemappedOwnProps {
  value?: unknown;
  field?: Lib.ParameterFieldInfo;
  parameter?: { id?: unknown };
  cardId?: unknown;
  dashboardId?: unknown;
  uuid?: unknown;
  token?: unknown;
}

interface RemappedDispatchProps {
  // The connect-bound form of `fetchRemapping`; the thunk resolves to its payload.
  fetchRemapping: (args: {
    parameter?: { id?: unknown };
    value?: unknown;
    field?: Lib.ParameterFieldInfo;
    cardId?: unknown;
    dashboardId?: unknown;
    uuid?: unknown;
    token?: unknown;
  }) => Promise<{ payload?: Remapping } | undefined>;
}

type RemappedClassProps = RemappedOwnProps & RemappedDispatchProps;

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
        this.props.field?.id !== nextProps.field?.id ||
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
        field: props.field,
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
      const [, remappedLabel] = this.state.remapping ?? [];
      if (remappedLabel != null) {
        return remappedLabel;
      }

      return null;
    }

    render() {
      const { fetchRemapping, ...props } = this.props;
      const displayValue = this.getDisplayValue();

      return <ComposedComponent {...props} displayValue={displayValue} />;
    }
  }

  // connect's class-component prop matching can't see through the dynamic
  // passthrough props, so cast around it and keep the public surface permissive.
  return connect(
    null,
    mapDispatchToProps,
    // Unjustified type cast. FIXME
  )(RemappedComponent as ComponentType<any>) as unknown as ComponentType<any>;
};
