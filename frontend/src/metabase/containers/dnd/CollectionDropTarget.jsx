import { DropTarget } from "react-dnd";

import { canonicalCollectionId } from "metabase/collections/utils";

import DropArea from "./DropArea";

import { MoveableDragTypes } from ".";

const CollectionDropTarget = DropTarget(
  MoveableDragTypes,
  {
    drop(props) {
      return { collection: props.collection };
    },
    canDrop(props, monitor) {
      const { collection } = props;
      const { item } = monitor.getItem();
      if (collection.can_write === false) {
        return false;
      }
      const droppingToSameCollection =
        canonicalCollectionId(item.collection_id) ===
        canonicalCollectionId(collection.id);
      return item.model !== "collection" && !droppingToSameCollection;
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)(DropArea);

export default CollectionDropTarget;
