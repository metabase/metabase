import PropTypes from "prop-types";
import { DropTarget } from "react-dnd";

import { isItemPinned } from "metabase/collections/utils";

import DropArea from "./DropArea";

import { PinnableDragTypes } from ".";

const PinnedItemSortDropTarget = DropTarget(
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
      if (!isItemPinned(item)) {
        return false;
      }

      if (itemModel != null && item.model !== itemModel) {
        return false;
      }

      if (isFrontTarget) {
        const isInFrontOfItem = pinIndex < item.collection_position;
        return isInFrontOfItem;
      } else if (isBackTarget) {
        const isBehindItem = pinIndex > item.collection_position;
        return isBehindItem;
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

PinnedItemSortDropTarget.propTypes = {
  isFrontTarget: PropTypes.bool,
  isBackTarget: PropTypes.bool,
  itemModel: PropTypes.string,
  pinIndex: PropTypes.number,
};

export default PinnedItemSortDropTarget;
