import React from "react";

import cx from "classnames";

import { DraggableCore } from "react-draggable";

export default class ResizablePane extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      width: props.initialWidth,
    };
  }

  render() {
    const { className, style, left } = this.props;
    return (
      <div
        className={cx(className, "relative")}
        style={{ ...(style || {}), width: this.state.width }}
      >
        {this.props.children}
        <DraggableCore
          axis="x"
          onStart={(e, d) => {
            console.log("start", e, d);
          }}
          onDrag={(e, d) => {
            console.log("drag", e, d);
          }}
          onStop={(e, d) => {
            console.log("stop", e, d);
          }}
        >
          <div
            className="absolute top bottom"
            style={{ right: -5, width: 10, background: "rgba(255,0,0,0.1)" }}
          />
        </DraggableCore>
      </div>
    );
  }
}
