/* eslint-disable react/prop-types */
import React from "react";
import { DragLayer } from "react-dnd";
import _ from "underscore";

import BodyComponent from "metabase/components/BodyComponent";
import BaseItemsTable, {
  BaseTableItem,
} from "metabase/collections/components/BaseItemsTable";

// NOTE: our verison of react-hot-loader doesn't play nice with react-dnd's DragLayer, so we exclude files named `*DragLayer.jsx` in webpack.config.js

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
    const { isDragging, currentOffset, selected, pinned, item } = this.props;
    if (!isDragging || !currentOffset) {
      return null;
    }
    const items = selected.length > 0 ? selected : [item.item];
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
          pinnedItems={pinned}
          draggedItem={item.item}
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
      nextProps.pinnedItems.length !== this.props.pinnedItems.length ||
      nextProps.draggedItem !== this.props.draggedItem
    );
  }

  compareItems = (item1, item2) =>
    item1.model === item2.model && item1.id === item2.id;

  isDraggedItemPinned = () => {
    const { pinnedItems, draggedItem } = this.props;
    const index = pinnedItems.findIndex(
      item => item.model === draggedItem.model && item.id === draggedItem.id,
    );
    return index >= 0;
  };

  renderDraggedItem = itemProps => {
    return (
      <BaseTableItem
        key={itemProps.item.id}
        {...itemProps}
        isPinned={this.isDraggedItemPinned()}
        hasBottomBorder={false}
      />
    );
  };

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
        {items.map(item => (
          <BaseItemsTable
            key={item.id}
            items={[draggedItem]}
            renderItem={this.renderDraggedItem}
            style={{ width: "960px" }}
            headless
          />
        ))}
      </div>
    );
  }
}
