import cx from "classnames";
import { Component } from "react";
import type { ConnectDropTarget } from "react-dnd";

import CS from "metabase/css/core/index.css";

interface DropTargetBackgroundAndBorderProps {
  highlighted: boolean;
  margin?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
}

const DropTargetBackgroundAndBorder = ({
  highlighted,
  margin = 0,
  marginLeft = margin,
  marginRight = margin,
  marginTop = margin,
  marginBottom = margin,
}: DropTargetBackgroundAndBorderProps) => (
  <div
    className={cx(CS.absolute, CS.rounded, {
      [CS.pointerEventsNone]: !highlighted,
    })}
    style={{
      top: -marginTop,
      left: -marginLeft,
      bottom: -marginBottom,
      right: -marginRight,
      zIndex: -1,
      boxSizing: "border-box",
    }}
  />
);

interface DropAreaProps {
  connectDropTarget: ConnectDropTarget;
  highlighted: boolean;
  hovered: boolean;
  hideUntilDrag?: boolean;
  children:
    | React.ReactNode
    | ((props: Record<string, unknown>) => React.ReactNode);
  className?: string;
  style?: React.CSSProperties;
  enableDropTargetBackground?: boolean;
  margin: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
}

interface DropAreaState {
  show: boolean;
}

export class DropArea extends Component<DropAreaProps, DropAreaState> {
  constructor(props: DropAreaProps) {
    super(props);
    this.state = {
      show: this._shouldShow(props),
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps: DropAreaProps) {
    // need to delay showing/hiding due to Chrome bug where "dragend" is triggered
    // immediately if the content shifts during "dragstart"
    // https://github.com/react-dnd/react-dnd/issues/477
    if (this._shouldShow(this.props) !== this._shouldShow(nextProps)) {
      setTimeout(() => this.setState({ show: this._shouldShow(nextProps) }), 0);
    }
  }

  _shouldShow(props: DropAreaProps) {
    return !props.hideUntilDrag || props.highlighted;
  }

  render() {
    const {
      connectDropTarget,
      children,
      className,
      style,
      enableDropTargetBackground = true,
      ...props
    } = this.props;
    return this.state.show
      ? connectDropTarget(
          <div className={cx(CS.relative, className)} style={style}>
            {typeof children === "function" ? children(props) : children}
            {enableDropTargetBackground && (
              <DropTargetBackgroundAndBorder {...props} />
            )}
          </div>,
        )
      : null;
  }
}
