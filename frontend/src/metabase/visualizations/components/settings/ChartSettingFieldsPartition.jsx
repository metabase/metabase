import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { DragSource, DropTarget } from "react-dnd";
// import { findDOMNode } from "react-dom";

import Grabber from "metabase/components/Grabber";

class ChartSettingFieldsPartition extends React.Component {
  constructor(props) {
    super(props);
    this.state = { displayedValue: null };
  }

  updateDisplayedValue = displayedValue => this.setState({ displayedValue });
  commitDisplayedValue = () => {
    const { displayedValue } = this.state;
    if (displayedValue != null) {
      this.props.onChange(displayedValue);
      this.setState({ displayedValue: null });
    }
  };

  render() {
    const value = this.state.displayedValue || this.props.value || {};
    return (
      <div>
        {this.props.partitions.map(({ name, title }, index) => (
          <div className={cx("py2", { "border-top": index > 0 })}>
            <h4 className="mb2">{title}</h4>
            <Partition
              partitionName={name}
              columns={value[name]}
              value={value}
              updateDisplayedValue={this.updateDisplayedValue}
              commitDisplayedValue={this.commitDisplayedValue}
            />
          </div>
        ))}
      </div>
    );
  }
}

class Partition extends React.Component {
  render() {
    const {
      columns = [],
      partitionName,
      // connectDropTarget,
      updateDisplayedValue,
      commitDisplayedValue,
      value,
    } = this.props;
    // return connectDropTarget(
    return (
      <div>
        {columns.length === 0 ? (
          <EmptyPartition
            value={value}
            partitionName={partitionName}
            updateDisplayedValue={updateDisplayedValue}
          />
        ) : (
          columns.map((col, index) => (
            <Column
              partitionName={partitionName}
              column={col}
              index={index}
              value={value}
              updateDisplayedValue={updateDisplayedValue}
              commitDisplayedValue={commitDisplayedValue}
            />
          ))
        )}
      </div>
    );
  }
}

@DropTarget(
  "columns",
  {
    canDrop: (props, monitor) => true,
    hover: (props, monitor, component) => {
      const item = monitor.getItem();
      const { index: dragIndex, partitionName: itemPartition } = item;
      const { value, partitionName, updateDisplayedValue } = props;
      updateDisplayedValue({
        ...value,
        [itemPartition]: [
          ...value[itemPartition].slice(0, dragIndex),
          ...value[itemPartition].slice(dragIndex + 1),
        ],
        [partitionName]: [value[itemPartition][dragIndex]],
      });
      item.index = 0;
      item.partitionName = partitionName;
    },
  },
  (connect, monitor) => ({ connectDropTarget: connect.dropTarget() }),
)
class EmptyPartition extends React.Component {
  render() {
    return this.props.connectDropTarget(<div>{t`Drag fields here`}</div>);
  }
}

function swap(a, i1, i2) {
  const aDupe = [...a];
  aDupe[i1] = a[i2];
  aDupe[i2] = a[i1];
  return aDupe;
}

@DropTarget(
  "columns",
  {
    canDrop: (props, monitor) => true,
    hover: (props, monitor, component) => {
      const item = monitor.getItem();
      const { index: dragIndex, partitionName: itemPartition } = item;
      const hoverIndex = props.index;
      const { value, partitionName, updateDisplayedValue } = props;
      if (dragIndex === hoverIndex && props.partitionName === itemPartition) {
        return;
      } else if (partitionName === itemPartition) {
        updateDisplayedValue({
          ...value,
          [itemPartition]: swap(value[itemPartition], dragIndex, hoverIndex),
        });
        item.index = hoverIndex;
      } else {
        updateDisplayedValue({
          ...value,
          [itemPartition]: [
            ...value[itemPartition].slice(0, dragIndex),
            ...value[itemPartition].slice(dragIndex + 1),
          ],
          [partitionName]: [
            ...value[partitionName].slice(0, hoverIndex),
            value[itemPartition][dragIndex],
            ...value[partitionName].slice(hoverIndex),
          ],
        });
        item.index = hoverIndex;
        item.partitionName = partitionName;
      }
    },
    drop: ({ index, column, partitionName }, monitor, component) => ({
      index,
      column,
      partitionName,
    }),
  },
  (connect, monitor) => ({ connectDropTarget: connect.dropTarget() }),
)
@DragSource(
  "columns",
  {
    beginDrag: ({ column, partitionName, index }) => ({
      column,
      partitionName,
      index,
    }),
    endDrag: (props, monitor, component) => {
      if (!monitor.didDrop()) {
        return;
      }

      props.commitDisplayedValue();
    },
  },
  (connect, monitor) => ({
    connectDragSource: connect.dragSource(),
    isDragging: monitor.isDragging(),
  }),
)
class Column extends React.Component {
  render() {
    const {
      column,
      connectDragSource,
      connectDropTarget,
      isDragging,
    } = this.props;
    return connectDropTarget(
      connectDragSource(
        <div
          className={cx(
            "text-dark p1 mb1 bordered rounded dropshadow text-bold flex justify-between",
            { disabled: isDragging },
          )}
        >
          {column.display_name}
          <Grabber style={{ width: 10 }} />
        </div>,
      ),
    );
  }
}

export default ChartSettingFieldsPartition;
