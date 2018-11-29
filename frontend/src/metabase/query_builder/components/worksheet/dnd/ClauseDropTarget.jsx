import React from "react";
import { DropTarget } from "react-dnd";

import DropArea from "metabase/containers/dnd/DropArea";
import { DragTypes } from ".";

import { ClauseContainer } from "../Clause";

import { alpha } from "metabase/lib/colors";

class ClauseWrapper extends React.Component {
  render() {
    const {
      hovered,
      highlighted,
      connectDropTarget,
      color,
      children,
    } = this.props;
    return connectDropTarget(
      <div>
        <ClauseContainer
          color={color}
          style={{
            borderColor: hovered ? color : "transparent",
            borderWidth: 3,
            borderStyle: "solid",
            backgroundColor: alpha(color, highlighted ? 0.5 : 0.25),
          }}
        >
          {children}
        </ClauseContainer>
      </div>,
    );
  }
}

const ClauseDropTarget = DropTarget(
  [DragTypes.DIMENSION],
  {
    drop(props, monitor, component) {
      const item = monitor.getItem();
      if (props.onDrop && item) {
        props.onDrop(item.dimension);
      }
    },
    canDrop(props, monitor) {
      if (props.canDrop) {
        return props.canDrop(monitor.getItem());
      }
      return true;
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)(ClauseWrapper);

export default ClauseDropTarget;
