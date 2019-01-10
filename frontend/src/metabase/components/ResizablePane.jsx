import React from "react";
import { Absolute, Relative } from "metabase/components/Position";

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
    const { children } = this.props;
    const { width } = this.state;
    return (
      <Relative style={{ width }}>
        {children}
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
          <Absolute
            top={0}
            bottom={0}
            w={10}
            right={-5}
            bg={"rgba(255,0,0,0.1)"}
          />
        </DraggableCore>
      </Relative>
    );
  }
}
