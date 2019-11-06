import React, { Component } from "react";
import ReactDOM from "react-dom";

import GridItem from "./GridItem";

import _ from "underscore";
import { color } from "metabase/lib/colors";

export default class GridLayout extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      width: 0,
      layout: props.layout,
      dragging: false,
      resizing: false,
      placeholderLayout: null,
    };

    _.bindAll(
      this,
      "onDrag",
      "onDragStart",
      "onDragStop",
      "onResize",
      "onResizeStart",
      "onResizeStop",
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
    const width = ReactDOM.findDOMNode(this).parentNode.offsetWidth;
    if (this.state.width !== width) {
      this.setState({ width });
    }
  }

  onDragStart(i, { position }) {
    // this.setState({ dragging: true })
  }

  layoutsOverlap(a, b) {
    return (
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    );
  }

  onDrag(i, { position }) {
    const placeholderLayout = {
      ...this.computeDraggedLayout(i, position),
      i: "placeholder",
    };
    this.setState({ dragging: true, placeholderLayout: placeholderLayout });
    this.props.onDrag();
  }

  onDragStop(i, { position }) {
    const { placeholderLayout } = this.state;
    let newLayout;
    if (placeholderLayout) {
      const { x, y, w, h } = placeholderLayout;
      newLayout = this.state.layout.map(l =>
        l.i === i ? { ...l, x, y, w, h } : l,
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
    const originalLayout = this.getLayoutForItem(i);
    const pos = this.getStyleForLayout(originalLayout);
    pos.top += position.y;
    pos.left += position.x;

    const maxX = this.props.cols - originalLayout.w;
    const maxY = Infinity;

    const targetLayout = {
      w: originalLayout.w,
      h: originalLayout.h,
      x: Math.min(maxX, Math.max(0, Math.round(pos.left / cellSize.width))),
      y: Math.min(maxY, Math.max(0, Math.round(pos.top / cellSize.height))),
    };
    const proposedLayout = targetLayout;
    for (const otherLayout of this.state.layout) {
      if (
        originalLayout !== otherLayout &&
        this.layoutsOverlap(proposedLayout, otherLayout)
      ) {
        return this.state.placeholderLayout || originalLayout;
      }
    }
    return proposedLayout;
  }

  onResizeStart(i, { size }) {
    this.setState({ resizing: true });
    this.onResize(i, { size });
  }

  onResize(i, { size }) {
    const placeholderLayout = {
      ...this.computeResizedLayout(i, size),
      i: "placeholder",
    };
    this.setState({ placeholderLayout: placeholderLayout });
  }

  onResizeStop(i, { size }) {
    const { x, y, w, h } = this.state.placeholderLayout;
    const newLayout = this.state.layout.map(l =>
      l.i === i ? { ...l, x, y, w, h } : l,
    );
    this.setState({ resizing: false, placeholderLayout: null }, () =>
      this.props.onLayoutChange(newLayout),
    );
  }

  computeResizedLayout(i, size) {
    const cellSize = this.getCellSize();
    const originalLayout = this.getLayoutForItem(i);

    const minW = originalLayout.minSize.width;
    const minH = originalLayout.minSize.height;
    const maxW = this.props.cols - originalLayout.x;
    const maxH = Infinity;
    const targetLayout = {
      w: Math.min(
        maxW,
        Math.max(minW, Math.round(size.width / cellSize.width)),
      ),
      h: Math.min(
        maxH,
        Math.max(minH, Math.round(size.height / cellSize.height)),
      ),
      x: originalLayout.x,
      y: originalLayout.y,
    };

    const proposedLayout = targetLayout;
    for (const otherLayout of this.state.layout) {
      if (
        originalLayout !== otherLayout &&
        this.layoutsOverlap(proposedLayout, otherLayout)
      ) {
        return this.state.placeholderLayout || originalLayout;
      }
    }
    return proposedLayout;
  }

  getLayoutForItem(i) {
    return _.findWhere(this.state.layout, { i: i });
  }

  getCellSize() {
    const { margin } = this.props;
    // add 1 margin to make it fill the full width
    return {
      width: (this.state.width + margin) / this.props.cols,
      height: this.props.rowHeight,
    };
  }

  getMinSizeForLayout(l) {
    const { margin } = this.props;
    const cellSize = this.getCellSize();
    return {
      width: cellSize.width * l.minSize.width - margin,
      height: cellSize.height * l.minSize.height - margin,
    };
  }

  getStyleForLayout(l) {
    const { margin } = this.props;
    const cellSize = this.getCellSize();
    return {
      width: cellSize.width * l.w - margin,
      height: cellSize.height * l.h - margin,
      left: cellSize.width * l.x + margin / 2,
      top: cellSize.height * l.y + margin / 2,
    };
  }

  renderChild(child) {
    const l = this.getLayoutForItem(child.key);
    const style = this.getStyleForLayout(l);
    return (
      <GridItem
        {...l}
        {...style}
        key={l.i}
        onDragStart={this.onDragStart}
        onDrag={this.onDrag}
        onDragStop={this.onDragStop}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeStop={this.onResizeStop}
        minSize={this.getMinSizeForLayout(l)}
      >
        {child}
      </GridItem>
    );
  }

  renderPlaceholder() {
    if (this.state.placeholderLayout) {
      const style = {
        ...this.getStyleForLayout(this.state.placeholderLayout),
      };
      return <div className="react-grid-placeholder absolute" style={style} />;
    }
  }

  // generate one row of the grid, it will repeat because it's a background image
  getGridBackground() {
    const { margin, cols } = this.props;
    const cellSize = this.getCellSize();
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${cellSize.width *
        cols}' height='${cellSize.height}'>` +
      _(cols)
        .times(
          i =>
            `<rect stroke='${color(
              "border",
            )}' stroke-width='1' fill='none' x='${Math.round(
              margin / 2 + i * cellSize.width,
            ) + 1.5}' y='${margin / 2 + 1.5}' width='${Math.round(
              cellSize.width - margin - 3,
            )}' height='${cellSize.height - margin - 3}'/>`,
        )
        .join("") +
      `</svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }

  render() {
    const { className, layout, cols, margin, isEditing } = this.props;

    const cellSize = this.getCellSize();
    let bottom = Math.max(...layout.map(l => l.y + l.h));

    let backgroundImage;
    if (isEditing) {
      // render grid as a background image:
      backgroundImage = this.getGridBackground();
      // add one vertical screen worth of rows to ensure the grid fills the screen
      bottom += Math.ceil(window.innerHeight / cellSize.height);
    }

    const width = cellSize.width * cols;
    const height = cellSize.height * bottom;

    // subtract half of a margin to ensure it lines up with the edges
    return (
      <div
        className={className}
        style={{
          position: "relative",
          width,
          height,
          backgroundImage,
          marginLeft: -margin / 2,
          marginRight: -margin / 2,
        }}
      >
        {this.props.children.map(child => this.renderChild(child))}
        {this.renderPlaceholder()}
      </div>
    );
  }
}
