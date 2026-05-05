import { Component } from "react";
import { DragLayer, type XYCoord } from "react-dnd";
import _ from "underscore";

import type { CollectionContentTableColumnsMap } from "metabase/collections/components/CollectionContent/constants";
import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import { BaseItemsTable } from "metabase/common/components/ItemsTable/BaseItemsTable";
import type { ItemRendererProps } from "metabase/common/components/ItemsTable/DefaultItemRenderer";
import { Box, Portal } from "metabase/ui";
import type { Collection, CollectionItem } from "metabase-types/api";

interface ItemsDragLayerInnerProps {
  isDragging: boolean;
  currentOffset: XYCoord | null;
  selectedItems: CollectionItem[];
  pinnedItems: CollectionItem[];
  item: { item: CollectionItem } | null;
  collection: Collection;
  visibleColumnsMap: CollectionContentTableColumnsMap;
}

class ItemsDragLayerInner extends Component<ItemsDragLayerInnerProps> {
  render() {
    const {
      isDragging,
      currentOffset,
      selectedItems,
      pinnedItems,
      item,
      collection,
      visibleColumnsMap,
    } = this.props;
    if (!isDragging || !currentOffset) {
      return null;
    }
    const items = selectedItems.length > 0 ? selectedItems : [item!.item];
    const x = currentOffset.x + window.scrollX;
    const y = currentOffset.y + window.scrollY;
    return (
      <Portal>
        <Box
          pos="absolute"
          left={0}
          top={0}
          opacity={0.65}
          style={{
            transform: `translate(${x}px, ${y}px)`,
            pointerEvents: "none",
            zIndex: 999,
          }}
        >
          <DraggedItems
            items={items}
            draggedItem={item!.item}
            pinnedItems={pinnedItems}
            collection={collection}
            visibleColumnsMap={visibleColumnsMap}
          />
        </Box>
      </Portal>
    );
  }
}

export const ItemsDragLayer = DragLayer((monitor) => ({
  item: monitor.getItem(),
  // itemType: monitor.getItemType(),
  initialOffset: monitor.getInitialSourceClientOffset(),
  currentOffset: monitor.getSourceClientOffset(),
  isDragging: monitor.isDragging(),
  // react-dnd v7 HOC types can't express the own/collected props split
}))(ItemsDragLayerInner as any);

interface DraggedItemsProps {
  items: CollectionItem[];
  draggedItem: CollectionItem;
  pinnedItems: CollectionItem[];
  collection: Collection;
  visibleColumnsMap: CollectionContentTableColumnsMap;
}

class DraggedItems extends Component<DraggedItemsProps> {
  shouldComponentUpdate(nextProps: DraggedItemsProps) {
    // necessary for decent drag performance
    return (
      nextProps.items.length !== this.props.items.length ||
      nextProps.pinnedItems.length !== this.props.pinnedItems.length ||
      nextProps.draggedItem !== this.props.draggedItem
    );
  }

  checkIsPinned = (item: CollectionItem) => {
    const { pinnedItems } = this.props;
    const index = pinnedItems.findIndex(
      (i) => i.model === item.model && i.id === item.id,
    );
    return index >= 0;
  };

  renderItem = ({ item, ...itemProps }: ItemRendererProps) => {
    const isPinned = this.checkIsPinned(item);
    const key = `${item.model}-${item.id}`;

    if (isPinned) {
      return (
        <td style={{ padding: 0 }}>
          <PinnedItemCard
            key={key}
            item={item}
            collection={this.props.collection}
            onCopy={_.noop}
            onMove={_.noop}
          />
        </td>
      );
    }
    return (
      <BaseItemsTable.Item
        key={key}
        {...itemProps}
        item={item}
        isPinned={false}
        draggable={false}
      />
    );
  };

  render() {
    const { items, draggedItem, visibleColumnsMap } = this.props;
    const index = _.findIndex(items, draggedItem);
    const allPinned = items.every((item) => this.checkIsPinned(item));
    return (
      <div
        style={{
          position: "absolute",
          transform: index > 0 ? `translate(0px, ${-index * 72}px)` : undefined,
        }}
      >
        <BaseItemsTable
          items={items}
          ItemComponent={(props) => this.renderItem(props)}
          headless
          isInDragLayer
          style={{ width: allPinned ? 400 : undefined }}
          includeColGroup={!allPinned}
          visibleColumnsMap={visibleColumnsMap}
        />
      </div>
    );
  }
}
