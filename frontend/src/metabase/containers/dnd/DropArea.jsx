/* eslint-disable react/prop-types */
import { Component } from "react";
import cx from "classnames";

const DropTargetBackgroundAndBorder = ({
  highlighted,
  hovered,
  noDrop = false,
  margin = 0,
  marginLeft = margin,
  marginRight = margin,
  marginTop = margin,
  marginBottom = margin,
}) => (
  <div
    className={cx("absolute rounded", {
      "pointer-events-none": !highlighted,
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

export default class DropArea extends Component {
  constructor(props) {
    super(props);
    this.state = {
      show: this._shouldShow(props),
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    // need to delay showing/hiding due to Chrome bug where "dragend" is triggered
    // immediately if the content shifts during "dragstart"
    // https://github.com/react-dnd/react-dnd/issues/477
    if (this._shouldShow(this.props) !== this._shouldShow(nextProps)) {
      setTimeout(() => this.setState({ show: this._shouldShow(nextProps) }), 0);
    }
  }

  _shouldShow(props) {
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
          <div className={cx("relative", className)} style={style}>
            {typeof children === "function" ? children(props) : children}
            {enableDropTargetBackground && (
              <DropTargetBackgroundAndBorder {...props} />
            )}
          </div>,
        )
      : null;
  }
}
