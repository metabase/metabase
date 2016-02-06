import React, { Component, PropTypes } from "react";

import { DraggableCore } from "react-draggable";
import { Resizable } from "react-resizable";

import cx from "classnames";

export default class GridItem extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            dragging: null,
            resizing: null
        };
    }

    onDragHandler(handlerName) {
      return (e, {element, position}) => {

        let { dragStartPosition } = this.state;
        if (handlerName === "onDragStart") {
            dragStartPosition = position;
            this.setState({ dragStartPosition: position });
        }
        let pos = {
            x: position.clientX - dragStartPosition.clientX,
            y: position.clientY - dragStartPosition.clientY,
        }
        this.setState({ dragging: handlerName === "onDragStop" ? null : pos });

        this.props[handlerName](this.props.i, {e, element, position: pos });
      };
    }

    onResizeHandler(handlerName) {
      return (e, {element, size}) => {

        if (handlerName !== "onResizeStart") {
            this.setState({ resizing: handlerName === "onResizeStop" ? null : size });
        }

        this.props[handlerName](this.props.i, {e, element, size});
      };
    }

    render() {
        let { width, height, top, left } = this.props;

        if (this.state.dragging) {
            left += this.state.dragging.x;
            top += this.state.dragging.y;
        }

        if (this.state.resizing) {
            width = this.state.resizing.width;
            height = this.state.resizing.height;
        }

        let style = {
            width, height, top, left,
            position: "absolute"
        };

        let child = React.Children.only(this.props.children);
        return (
            <DraggableCore
                cancel=".react-resizable-handle"
                onStart={this.onDragHandler("onDragStart")}
                onDrag={this.onDragHandler("onDrag")}
                onStop={this.onDragHandler("onDragStop")}
            >
                <Resizable
                    width={this.props.width}
                    height={this.props.height}
                    onResizeStart={this.onResizeHandler("onResizeStart")}
                    onResize={this.onResizeHandler("onResize")}
                    onResizeStop={this.onResizeHandler("onResizeStop")}
                >
                    {React.cloneElement(child, {
                        style: style,
                        className: cx(child.props.className, { dragging: !!this.state.dragging, resizing: !!this.state.resizing })
                    })}
                </Resizable>
            </DraggableCore>
        );
    }
}
