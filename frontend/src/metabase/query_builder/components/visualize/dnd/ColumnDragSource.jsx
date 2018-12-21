import React from "react";

import { DragSource } from "react-dnd";

import { DragTypes } from ".";

const columnSource = {
  beginDrag(props) {
    return {
      column: props.column,
      dimension: props.dimension,
      aggregation: props.aggregation,
    };
  },
};

function collect(connect, monitor) {
  return {
    connectDragSource: connect.dragSource(),
    isDragging: monitor.isDragging(),
  };
}

class ColumnWrapper extends React.Component {
  render() {
    const {
      isDragging,
      connectDragSource,
      children,
      style = {},
      className,
    } = this.props;
    return connectDragSource(
      <div
        style={{ ...style, opacity: isDragging ? 0.5 : 1 }}
        className={className}
      >
        {children}
      </div>,
    );
  }
}

// Export the wrapped component:
const ColumnDragSource = DragSource(DragTypes.COLUMN, columnSource, collect)(
  ColumnWrapper,
);

export default ColumnDragSource;
