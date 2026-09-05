import type { ReactElement, ReactNode } from "react";
import { Component } from "react";
import type {
  ConnectDragPreview,
  ConnectDragSource,
  DragSourceMonitor,
} from "react-dnd";
import { DragSource } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { getErrorMessage } from "metabase/api/utils";
import { isRootTrashCollection } from "metabase/common/collections/utils";
import {
  type MovableItem,
  type PinnableItem,
  useSetCollection,
  useSetPinned,
  useToast,
} from "metabase/common/hooks";
import type { Collection, CollectionItem } from "metabase-types/api";

import { type ItemDropResult, handleItemDrop } from "./handle-item-drop";

import { type ItemDragPayload, dragTypeForItem, isItemDragPayload } from ".";

interface ItemDragSourceInnerProps {
  connectDragSource: ConnectDragSource;
  connectDragPreview: ConnectDragPreview;
  isDragging: boolean;
  children: ReactElement | ((props: Record<string, unknown>) => ReactElement);
  [key: string]: unknown;
}

class ItemDragSourceInner extends Component<ItemDragSourceInnerProps> {
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

interface DragSourceOwnProps {
  item: CollectionItem;
  isSelected?: boolean;
  selected?: CollectionItem[];
  collection?: Collection;
  onDrop?: () => void;
  onMoveError?: (error: unknown) => void;
  setPinned: (
    item: PinnableItem,
    pinned: boolean | number,
  ) => PromiseLike<unknown>;
  setCollection: (
    item: MovableItem,
    destination: { id: Collection["id"] },
  ) => Promise<unknown>;
  children?: ReactNode | ((props: Record<string, unknown>) => ReactNode);
}

const DragSourceComponent = DragSource(
  (props: DragSourceOwnProps) => dragTypeForItem(props.item),
  {
    canDrag({ item, isSelected, selected, collection }: DragSourceOwnProps) {
      if (item.model === "collection") {
        return false;
      }

      // can't drag if can't write the parent collection
      if (
        collection &&
        !isRootTrashCollection(collection) &&
        collection.can_write === false
      ) {
        return false;
      }

      const numSelected = selected?.length ?? 0;

      return isSelected || numSelected === 0;
    },
    beginDrag(props: DragSourceOwnProps) {
      const items =
        props.isSelected && props.selected?.length
          ? [...props.selected]
          : [props.item];

      return { items } satisfies ItemDragPayload;
    },
    async endDrag(
      { onDrop, onMoveError, setPinned, setCollection }: DragSourceOwnProps,
      monitor: DragSourceMonitor,
    ) {
      if (!monitor.didDrop()) {
        return;
      }
      const payload = monitor.getItem();
      if (!isItemDragPayload(payload)) {
        return;
      }
      const { items } = payload;
      // React DnD v4 does not expose a type for target-specific drop results.
      const dropResult = monitor.getDropResult() as ItemDropResult;
      if (items.length > 0) {
        try {
          const handled = await handleItemDrop({
            items,
            dropResult,
            setPinned,
            setCollection,
          });
          if (handled) {
            onDrop?.();
          }
        } catch (e) {
          onMoveError?.(e);
        }
      }
    },
  },
  (connect, monitor) => ({
    connectDragSource: connect.dragSource(),
    connectDragPreview: connect.dragPreview(),
    isDragging: monitor.isDragging(),
  }),
  // react-dnd v4 HOC types can't express the own/collected props split
)(ItemDragSourceInner as any);

interface ItemDragSourceProps {
  item: CollectionItem;
  isSelected?: boolean;
  selected?: CollectionItem[];
  collection?: Collection;
  onDrop?: () => void;
  children?: ReactNode | ((props: Record<string, unknown>) => ReactNode);
}

export function ItemDragSource(props: ItemDragSourceProps) {
  const [sendToast] = useToast();
  const setPinned = useSetPinned();
  const setCollection = useSetCollection();
  const onMoveError = (error: unknown) =>
    sendToast({
      message: getErrorMessage(error),
      icon: "warning_triangle_filled",
      iconColor: "feedback-warning",
    });
  return (
    <DragSourceComponent
      {...props}
      onMoveError={onMoveError}
      setPinned={setPinned}
      setCollection={setCollection}
    />
  );
}
