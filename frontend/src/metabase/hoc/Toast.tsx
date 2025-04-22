/* eslint-disable react/prop-types */
import { Component, type ComponentType } from "react";
import type { ConnectedProps } from "react-redux";
import { omit } from "underscore";

import { connect } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { Undo } from "metabase-types/store/undo";

const mapDispatchToProps = {
  addUndo,
};

export interface WithToasterReturned {
  triggerToast: (
    message: Undo["message"],
    options: Partial<Omit<Undo, "message">>,
  ) => void;
}

const connector = connect(null, mapDispatchToProps);
type ReduxProps = ConnectedProps<typeof connector>;
/**
 * @deprecated HOCs are deprecated
 */
const withToaster = (ComposedComponent: ComponentType<WithToasterReturned>) => {
  class ToastedComponent extends Component<ReduxProps> {
    _triggerToast = (message: Undo["message"], options = {}) => {
      const { addUndo } = this.props;
      addUndo({ message, ...options });
    };
    render() {
      return (
        <ComposedComponent
          triggerToast={this._triggerToast}
          {...omit(this.props, "addUndo")}
        />
      );
    }
  }
  return ToastedComponent;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default withToaster;
