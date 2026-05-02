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
import { isRootTrashCollection } from "metabase/collections/utils";
import {
  type PinnableItem,
  isPinnable,
  useSetPinned,
  useToast,
} from "metabase/common/hooks";
import type { Collection, CollectionItem } from "metabase-types/api";

import { dragTypeForItem } from ".";

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
  setPinned: (item: PinnableItem, pinned: boolean | number) => void;
  children?: ReactNode | ((props: Record<string, unknown>) => ReactNode);
}

const DragSourceComponent = DragSource(
  (props: DragSourceOwnProps) => dragTypeForItem(props.item),
  {
    canDrag({ isSelected, selected, collection }: DragSourceOwnProps) {
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
      return { item: props.item };
    },
    async endDrag(
      { selected, onDrop, onMoveError, setPinned }: DragSourceOwnProps,
      monitor: DragSourceMonitor,
    ) {
      if (!monitor.didDrop()) {
        return;
      }
      const { item } = monitor.getItem() as { item: CollectionItem };
      const { collection, pinIndex } = monitor.getDropResult() as {
        collection?: Collection;
        pinIndex?: number;
      };
      if (item) {
        const items = selected && selected.length > 0 ? selected : [item];
        try {
          if (collection !== undefined) {
            await Promise.all(
              items.map((i) => i.setCollection && i.setCollection(collection)),
            );
          } else if (pinIndex !== undefined) {
            await Promise.all(
              items.filter(isPinnable).map((i) => setPinned(i, pinIndex)),
            );
          }

          onDrop?.();
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
  // react-dnd v7 HOC types can't express the own/collected props split
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
  const onMoveError = (error: unknown) =>
    sendToast({
      message: getErrorMessage(error),
      icon: "warning_triangle_filled",
      iconColor: "warning",
    });
  return (
    <DragSourceComponent
      {...props}
      onMoveError={onMoveError}
      setPinned={setPinned}
    />
  );
}
