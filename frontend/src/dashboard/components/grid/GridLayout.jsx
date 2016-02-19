import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import GridItem from "./GridItem.jsx";

import _ from "underscore";

const MARGIN = 10;

export default class GridLayout extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            width: 0,
            layout: props.layout,
            dragging: false,
            resizing: false,
            placeholderLayout: null
        };

        _.bindAll(this,
            "onDrag", "onDragStart", "onDragStop",
            "onResize", "onResizeStart", "onResizeStop"
        );
    }

    componentWillReceiveProps(newProps) {
        const { dragging, resizing } = this.state;
        if (!dragging && !resizing && this.state.layout !== newProps.layout) {
            this.setState({ layout: newProps.layout });
        }
    }

    componentDidMount() {
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        let width = ReactDOM.findDOMNode(this).parentNode.offsetWidth;
        if (this.state.width !== width) {
            this.setState({ width });
        }
    }

    onDragStart(i, { position }) {
        // this.setState({ dragging: true })
    }

    layoutsOverlap(a, b) {
        return (
            a.x < (b.x + b.w) &&
            b.x < (a.x + a.w) &&
            a.y < (b.y + b.h) &&
            b.y < (a.y + a.h)
        );
    }

    onDrag(i, { position }) {
        let placeholderLayout = {
            ...this.computeDraggedLayout(i, position),
            i: "placeholder"
        }
        this.setState({ dragging: true, placeholderLayout: placeholderLayout });
        this.props.onDrag();
    }

    onDragStop(i, { position }) {
        const { placeholderLayout } = this.state;
        let newLayout;
        if (placeholderLayout) {
            let { x, y, w, h } = placeholderLayout;
            newLayout = this.state.layout.map(l => l.i === i ?
                { ...l, x, y, w, h } :
                l
            );
        }
        this.setState({ dragging: false, placeholderLayout: null });
        if (newLayout) {
            this.props.onLayoutChange(newLayout);
        }
        this.props.onDragStop();
    }

    computeDraggedLayout(i, position) {
        const cellSize = this.getCellSize();
        let originalLayout = this.getLayoutForItem(i);
        let pos = this.getStyleForLayout(originalLayout);
        pos.top += position.y;
        pos.left += position.x;

        let maxX = this.props.cols - originalLayout.w;
        let maxY = Infinity;

        let targetLayout = {
            w: originalLayout.w,
            h: originalLayout.h,
            x: Math.min(maxX, Math.max(0, Math.round(pos.left / cellSize.width))),
            y: Math.min(maxY, Math.max(0, Math.round(pos.top / cellSize.height)))
        };
        let proposedLayout = targetLayout;
        for (let otherLayout of this.state.layout) {
            if (originalLayout !== otherLayout && this.layoutsOverlap(proposedLayout, otherLayout)) {
                return this.state.placeholderLayout || originalLayout;
            }
        }
        return proposedLayout;
    }

    onResizeStart(i, { size }) {
        this.setState({ resizing: true });
    }

    onResize(i, { size }) {
        let placeholderLayout = {
            ...this.computeResizedLayout(i, size),
            i: "placeholder"
        };
        this.setState({ placeholderLayout: placeholderLayout });
    }

    onResizeStop(i, { size }) {
        let { x, y, w, h } = this.state.placeholderLayout;
        let newLayout = this.state.layout.map(l => l.i === i ?
            { ...l, x, y, w, h } :
            l
        );
        this.setState({ resizing: false, placeholderLayout: null }, () =>
            this.props.onLayoutChange(newLayout)
        );
    }

    computeResizedLayout(i, size) {
        let cellSize = this.getCellSize();
        let originalLayout = this.getLayoutForItem(i);

        let maxW = this.props.cols - originalLayout.x;
        let maxH = Infinity;
        let targetLayout = {
            w: Math.min(maxW, Math.max(1, Math.round(size.width / cellSize.width))),
            h: Math.min(maxH, Math.max(1, Math.round(size.height / cellSize.height))),
            x: originalLayout.x,
            y: originalLayout.y
        };

        let proposedLayout = targetLayout;
        for (let otherLayout of this.state.layout) {
            if (originalLayout !== otherLayout && this.layoutsOverlap(proposedLayout, otherLayout)) {
                return this.state.placeholderLayout || originalLayout;
            }
        }
        return proposedLayout;
    }

    getLayoutForItem(i) {
        return _.findWhere(this.state.layout, { i: i });
    }

    getCellSize() {
        return {
            width: this.state.width / this.props.cols,
            height: this.props.rowHeight
        };
    }

    getMinSize() {
        let cellSize = this.getCellSize();
        return {
            width: cellSize.width - MARGIN,
            height: cellSize.height - MARGIN
        }
    }

    getStyleForLayout(l) {
        let cellSize = this.getCellSize();
        let margin = l.i === "placeholder" ? -MARGIN : MARGIN;
        return {
            width: cellSize.width * l.w - margin,
            height: cellSize.height * l.h - margin,
            left: cellSize.width * l.x + margin / 2,
            top: cellSize.height * l.y + margin / 2
        };
    }

    renderChild(child) {
        let l = this.getLayoutForItem(child.key);
        let style = this.getStyleForLayout(l);
        return (
            <GridItem
                key={l.i}
                onDragStart={this.onDragStart}
                onDrag={this.onDrag}
                onDragStop={this.onDragStop}
                onResizeStart={this.onResizeStart}
                onResize={this.onResize}
                onResizeStop={this.onResizeStop}
                minSize={this.getMinSize()}
                {...l}
                {...style}
            >
                {child}
            </GridItem>
        )
    }

    renderPlaceholder() {
        if (this.state.placeholderLayout) {
            let style = {
                ...this.getStyleForLayout(this.state.placeholderLayout)
            }
            return (
                <div className="react-grid-placeholder absolute" style={style}></div>
            );
        }
    }

    render() {
        const { className, layout, rowHeight } = this.props;

        let bottom = Math.max(...layout.map(l => l.y + l.h));
        let totalHeight = (bottom + 3) * rowHeight;

        return (
            <div className={className} style={{ position: "relative", height: totalHeight }}>
                {this.props.children.map(child =>
                    this.renderChild(child)
                )}
                {this.renderPlaceholder()}
            </div>
        );
    }
}
