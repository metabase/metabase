import PropTypes from "prop-types";
import { DropTarget } from "react-dnd";

import { isItemPinned } from "metabase/collections/utils";

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
      const { variant } = props;
      // NOTE: not necessary to check collection permission here since we
      // enforce it when beginning to drag and item within the same collection
      if (variant === "pin") {
        return !isItemPinned(item);
      } else if (variant === "unpin") {
        return isItemPinned(item);
      }

      return false;
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)(DropArea);

PinDropTarget.propTypes = {
  variant: PropTypes.oneOf(["pin", "unpin"]).isRequired,
};

export default PinDropTarget;
