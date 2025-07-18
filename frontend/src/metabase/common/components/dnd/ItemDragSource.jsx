/* eslint-disable react/prop-types */
import { Component } from "react";
// import { DragSource } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { dragTypeForItem } from ".";

class ItemDragSource extends Component {
  componentDidMount() {
    // Use empty image as a drag preview so browsers don't draw it
    // and we can draw whatever we want on the custom drag layer instead.
    if (this.props.connectDragPreview) {
      this.props.connectDragPreview(getEmptyImage(), {
        // IE fallback: specify that we'd rather screenshot the node
        // when it already knows it's being dragged so we can hide it with CSS.
        captureDraggingState: true,
      });
    }
  }
  render() {
    const { connectDragSource, children, ...props } = this.props;
    return connectDragSource(
      // must be a native DOM element or use innerRef which appears to be broken
      // https://github.com/react-dnd/react-dnd/issues/1021
      // https://github.com/jxnblk/styled-system/pull/188
      typeof children === "function" ? children(props) : children,
    );
  }
}

// TODO: fix
export default ItemDragSource;
