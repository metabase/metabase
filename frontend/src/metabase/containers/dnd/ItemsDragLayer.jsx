import React from "react";
import { DragLayer } from "react-dnd";
import _ from "underscore";

import BodyComponent from "metabase/components/BodyComponent";
import { NormalItem } from "metabase/components/CollectionLanding";

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
    const { isDragging, currentOffset, selected, item } = this.props;
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
        <DraggedItems items={items} draggedItem={item.item} />
      </div>
    );
  }
}

class DraggedItems extends React.Component {
  shouldComponentUpdate(nextProps) {
    // necessary for decent drag performance
    return (
      nextProps.items.length !== this.props.items.length ||
      nextProps.draggedItem !== this.props.draggedItem
    );
  }
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
        {items.map(item => <NormalItem item={item} />)}
      </div>
    );
  }
}
