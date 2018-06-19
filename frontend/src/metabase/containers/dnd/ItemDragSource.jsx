import React from "react";

import { DragSource } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { dragTypeForItem } from ".";

@DragSource(
  props => dragTypeForItem(props.item),
  {
    canDrag(props, monitor) {
      // if items are selected only allow dragging selected items
      if (
        props.selection &&
        props.selection.size > 0 &&
        !props.selection.has(props.item)
      ) {
        return false;
      } else {
        return true;
      }
    },
    beginDrag(props, monitor, component) {
      return { item: props.item };
    },
    async endDrag(props, monitor, component) {
      if (!monitor.didDrop()) {
        return;
      }
      const { item } = monitor.getItem();
      const { collection, pinIndex } = monitor.getDropResult();
      if (item) {
        const items =
          props.selection && props.selection.size > 0
            ? Array.from(props.selection)
            : [item];
        try {
          if (collection !== undefined) {
            await Promise.all(
              items.map(i => i.setCollection && i.setCollection(collection)),
            );
          } else if (pinIndex !== undefined) {
            await Promise.all(
              items.map(i => i.setPinned && i.setPinned(pinIndex)),
            );
          }
        } catch (e) {
          alert("There was a problem moving these items: " + e);
        }
      }
    },
  },
  (connect, monitor) => ({
    connectDragSource: connect.dragSource(),
    connectDragPreview: connect.dragPreview(),
    isDragging: monitor.isDragging(),
  }),
)
export default class ItemDragSource extends React.Component {
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
      <div>{typeof children === "function" ? children(props) : children}</div>,
    );
  }
}
