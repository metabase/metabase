import { Component, type ComponentType } from "react";

import { connect } from "metabase/redux";
import { fetchRemapping } from "metabase/redux/remappings";
import type { State } from "metabase/redux/store";
import { getMetadata } from "metabase/selectors/metadata";
import type Field from "metabase-lib/v1/metadata/Field";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

type Remapping = [value: unknown, label: unknown];

interface RemappedOwnProps {
  value?: unknown;
  column?: Field;
  parameter?: { id?: unknown };
  cardId?: unknown;
  dashboardId?: unknown;
  uuid?: unknown;
  token?: unknown;
}

interface RemappedStateProps {
  metadata: Metadata;
}

interface RemappedDispatchProps {
  // The connect-bound form of `fetchRemapping`; the thunk resolves to its payload.
  fetchRemapping: (args: {
    parameter?: { id?: unknown };
    value?: unknown;
    field?: Field;
    cardId?: unknown;
    dashboardId?: unknown;
    uuid?: unknown;
    token?: unknown;
  }) => Promise<{ payload?: Remapping } | undefined>;
}

type RemappedClassProps = RemappedOwnProps &
  RemappedStateProps &
  RemappedDispatchProps;

const mapStateToProps = (state: State): RemappedStateProps => ({
  metadata: getMetadata(state),
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

    getDisplayValue(field: Field | null | undefined, value: unknown) {
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
  }

  // connect's class-component prop matching can't see through the dynamic
  // passthrough props, so cast around it and keep the public surface permissive.
  return connect(
    mapStateToProps,
    mapDispatchToProps,
  )(RemappedComponent as ComponentType<any>) as unknown as ComponentType<any>;
};
