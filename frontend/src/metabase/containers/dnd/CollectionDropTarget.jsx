import { DropTarget } from "react-dnd";

import DropArea from "./DropArea";
import { MoveableDragTypes } from ".";

const CollectionDropTarget = DropTarget(
  MoveableDragTypes,
  {
    drop(props, monitor, component) {
      return { collection: props.collection };
    },
    canDrop(props, monitor) {
      const { item } = monitor.getItem();
      return item.model !== "collection" || item.id !== props.collection.id;
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)(DropArea);

export default CollectionDropTarget;
