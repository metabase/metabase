import React, { Component } from "react";

import { DraggableCore } from "react-draggable";
import { Resizable } from "react-resizable";

import cx from "classnames";

export default class GridItem extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      dragging: null,
      resizing: null,
    };
  }

  onDragHandler(handlerName) {
    return (e, { node, x, y }) => {
      // react-draggle seems to return undefined/NaN occasionally, which breaks things
      if (isNaN(x) || isNaN(y)) {
        return;
      }

      let { dragStartPosition, dragStartScrollTop } = this.state;
      if (handlerName === "onDragStart") {
        dragStartPosition = { x, y };
        dragStartScrollTop = document.body.scrollTop;
        this.setState({ dragStartPosition, dragStartScrollTop });
      }

      // track vertical scroll. we don't need horizontal  allow horizontal scrolling
      const scrollTopDelta = document.body.scrollTop - dragStartScrollTop;
      // compute new position
      const pos = {
        x: x - dragStartPosition.x,
        y: y - dragStartPosition.y + scrollTopDelta,
      };

      if (handlerName === "onDragStop") {
        this.setState({ dragging: null });
      } else {
        this.setState({ dragging: pos });
      }

      this.props[handlerName](this.props.i, { e, node, position: pos });
    };
  }

  onResizeHandler(handlerName) {
    return (e, { element, size }) => {
      if (handlerName === "onResize") {
        this.setState({ resizing: size });
      }
      if (handlerName === "onResizeStop") {
        this.setState({ resizing: null });
      }

      this.props[handlerName](this.props.i, { e, element, size });
    };
  }

  render() {
    let { width, height, top, left, minSize } = this.props;

    if (this.state.dragging) {
      left += this.state.dragging.x;
      top += this.state.dragging.y;
    }

    if (this.state.resizing) {
      width = Math.max(minSize.width, this.state.resizing.width);
      height = Math.max(minSize.height, this.state.resizing.height);
    }

    const style = {
      width,
      height,
      top,
      left,
      position: "absolute",
    };

    const child = React.Children.only(this.props.children);
    return (
      <DraggableCore
        cancel=".react-resizable-handle, .drag-disabled"
        onStart={this.onDragHandler("onDragStart")}
        onDrag={this.onDragHandler("onDrag")}
        onStop={this.onDragHandler("onDragStop")}
      >
        <Resizable
          width={width}
          height={height}
          onResizeStart={this.onResizeHandler("onResizeStart")}
          onResize={this.onResizeHandler("onResize")}
          onResizeStop={this.onResizeHandler("onResizeStop")}
        >
          {React.cloneElement(child, {
            style: style,
            className: cx(child.props.className, {
              dragging: !!this.state.dragging,
              resizing: !!this.state.resizing,
            }),
          })}
        </Resizable>
      </DraggableCore>
    );
  }
}
