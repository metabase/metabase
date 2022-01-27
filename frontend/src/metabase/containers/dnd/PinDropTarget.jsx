import { DropTarget } from "react-dnd";

import DropArea from "./DropArea";
import { PinnableDragTypes } from ".";

const PinDropTarget = DropTarget(
  PinnableDragTypes,
  {
    drop(props, monitor, component) {
      if (!props.noDrop) {
        return { pinIndex: props.pinIndex };
      }
    },
    canDrop(props, monitor) {
      const { item } = monitor.getItem();
      const { isFrontTarget, isBackTarget, itemModel, pinIndex } = props;
      // NOTE: not necessary to check collection permission here since we
      // enforce it when beginning to drag and item within the same collection
      if (itemModel != null && item.model !== itemModel) {
        return false;
      }

      if (isFrontTarget) {
        const isInFrontOfItem = pinIndex < item.collection_position;
        return isInFrontOfItem;
      } else if (isBackTarget) {
        const isBehindItem = pinIndex > item.collection_position;
        return isBehindItem;
      } else {
        return pinIndex !== item.collection_position;
      }
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)(DropArea);

export default PinDropTarget;
