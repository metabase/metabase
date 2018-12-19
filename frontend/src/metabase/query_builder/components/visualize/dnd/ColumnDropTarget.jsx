import React from "react";
import { DropTarget } from "react-dnd";

import DropArea from "metabase/containers/dnd/DropArea";
import { DragTypes } from ".";

import { alpha } from "metabase/lib/colors";

class ColumnWrapper extends React.Component {
  render() {
    const {
      hovered,
      highlighted,
      connectDropTarget,
      className,
      style,
      children,
    } = this.props;
    return connectDropTarget(
      <div className={className} style={style}>
        {typeof children === "function"
          ? children({ hovered, highlighted })
          : children}
      </div>,
    );
  }
}

const ColumnDropTarget = DropTarget(
  [DragTypes.COLUMN],
  {
    drop(props, monitor, component) {
      const item = monitor.getItem();
      if (props.onDrop && item) {
        props.onDrop(item);
      }
    },
    canDrop(props, monitor) {
      const item = monitor.getItem();
      if (props.canDrop && item) {
        return props.canDrop(item);
      }
      return true;
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)(ColumnWrapper);

export default ColumnDropTarget;
