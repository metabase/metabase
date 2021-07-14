/* eslint-disable react/prop-types */
import React from "react";
import { DragLayer } from "react-dnd";
import _ from "underscore";

import BodyComponent from "metabase/components/BodyComponent";
import BaseItemsTable from "metabase/collections/components/BaseItemsTable";

// NOTE: our version of react-hot-loader doesn't play nice with react-dnd's DragLayer,
// so we exclude files named `*DragLayer.jsx` in webpack.config.js

@DragLayer((monitor, props) => ({
  item: monitor.getItem(),
  // itemType: monitor.getItemType(),
  initialOffset: monitor.getInitialSourceClientOffset(),
  currentOffset: monitor.getSourceClientOffset(),
  isDragging: monitor.isDragging(),
}))
@BodyComponent
export default class ItemsDragLayer extends React.Component {
  render() {
    const {
      isDragging,
      currentOffset,
      selectedItems,
      pinnedItems,
      item,
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
        }}
      >
        <DraggedItems
          items={items}
          draggedItem={item.item}
          pinnedItems={pinnedItems}
        />
      </div>
    );
  }
}

class DraggedItems extends React.Component {
  shouldComponentUpdate(nextProps) {
    // necessary for decent drag performance
    return (
      nextProps.items.length !== this.props.items.length ||
      nextProps.pinnedItems.length !== this.props.pinnedItems ||
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

  renderItem = ({ item, ...itemProps }) => (
    <BaseItemsTable.Item
      key={`${item.model}-${item.id}`}
      {...itemProps}
      item={item}
      isPinned={this.checkIsPinned(item)}
      draggable={false}
      hasBottomBorder={false}
    />
  );

  render() {
    const { items, draggedItem } = this.props;
    const index = _.findIndex(items, draggedItem);
    return (
      <div
        style={{
          position: "absolute",
          transform: index > 0 ? `translate(0px, ${-index * 72}px)` : null,
        }}
      >
        <BaseItemsTable
          items={items}
          renderItem={this.renderItem}
          headless
          style={{ width: 960 }}
        />
      </div>
    );
  }
}
