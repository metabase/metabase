/* eslint-disable react/prop-types */
import { Component } from "react";
import { DragLayer } from "react-dnd";
import _ from "underscore";

import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import BodyComponent from "metabase/components/BodyComponent";
import { BaseItemsTable } from "metabase/components/ItemsTable/BaseItemsTable";

// NOTE: our version of react-hot-loader doesn't play nice with react-dnd's DragLayer,
// so we exclude files named `*DragLayer.jsx` in webpack.config.js

class ItemsDragLayerInner extends Component {
  render() {
    const {
      isDragging,
      currentOffset,
      selectedItems,
      pinnedItems,
      item,
      collection,
    } = this.props;
    if (!isDragging || !currentOffset) {
      return null;
    }
    const items = selectedItems.length > 0 ? selectedItems : [item.item];
    const x = currentOffset.x + window.scrollX;
    const y = currentOffset.y + window.scrollY;
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translate(${x}px, ${y}px)`,
          pointerEvents: "none",
          opacity: 0.65,
          zIndex: 999,
        }}
      >
        <DraggedItems
          items={items}
          draggedItem={item.item}
          pinnedItems={pinnedItems}
          collection={collection}
        />
      </div>
    );
  }
}

const ItemsDragLayer = DragLayer((monitor, props) => ({
  item: monitor.getItem(),
  // itemType: monitor.getItemType(),
  initialOffset: monitor.getInitialSourceClientOffset(),
  currentOffset: monitor.getSourceClientOffset(),
  isDragging: monitor.isDragging(),
}))(ItemsDragLayerInner);

export default BodyComponent(ItemsDragLayer);

class DraggedItems extends Component {
  shouldComponentUpdate(nextProps) {
    // necessary for decent drag performance
    return (
      nextProps.items.length !== this.props.items.length ||
      nextProps.pinnedItems.length !== this.props.pinnedItems.length ||
      nextProps.draggedItem !== this.props.draggedItem
    );
  }

  checkIsPinned = item => {
    const { pinnedItems } = this.props;
    const index = pinnedItems.findIndex(
      i => i.model === item.model && i.id === item.id,
    );
    return index >= 0;
  };

  renderItem = ({ item, ...itemProps }) => {
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
        hasBottomBorder={false}
      />
    );
  };

  render() {
    const { items, draggedItem } = this.props;
    const index = _.findIndex(items, draggedItem);
    const allPinned = items.every(item => this.checkIsPinned(item));
    return (
      <div
        style={{
          position: "absolute",
          transform: index > 0 ? `translate(0px, ${-index * 72}px)` : null,
        }}
      >
        <BaseItemsTable
          items={items}
          ItemComponent={props => this.renderItem(props)}
          headless
          isInDragLayer
          style={{ width: allPinned ? 400 : undefined }}
          includeColGroup={!allPinned}
        />
      </div>
    );
  }
}
