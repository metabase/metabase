import React from "react";

import { DragSource } from "react-dnd";

import { DragTypes } from ".";

const dimensionSource = {
  beginDrag(props) {
    return { dimension: props.dimension };
  },
};

function collect(connect, monitor) {
  return {
    connectDragSource: connect.dragSource(),
    isDragging: monitor.isDragging(),
  };
}

class DimensionWrapper extends React.Component {
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
const DimensionDragSource = DragSource(
  DragTypes.DIMENSION,
  dimensionSource,
  collect,
)(DimensionWrapper);

export default DimensionDragSource;
