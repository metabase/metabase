import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { DragSource, DropTarget } from "react-dnd";

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
        {this.props.partitions.map(({ name, title, columnFilter }, index) => (
          <div className={cx("py2", { "border-top": index > 0 })}>
            <h4 className="mb2">{title}</h4>
            <Partition
              columnFilter={columnFilter}
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
      columnFilter,
      updateDisplayedValue,
      commitDisplayedValue,
      value,
    } = this.props;
    return (
      <div>
        {columns.length === 0 ? (
          <EmptyPartition
            columnFilter={columnFilter}
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
              columnFilter={columnFilter}
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
    hover: (props, monitor, component) => {
      const item = monitor.getItem();
      if (props.columnFilter && props.columnFilter(item.column) === false) {
        return;
      }
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

@DropTarget(
  "columns",
  {
    hover: (props, monitor, component) => {
      const item = monitor.getItem();
      if (props.columnFilter && props.columnFilter(item.column) === false) {
        return;
      }
      const { index: dragIndex, partitionName: itemPartition } = item;
      const hoverIndex = props.index;
      const { value, partitionName, updateDisplayedValue } = props;
      if (partitionName === itemPartition && dragIndex !== hoverIndex) {
        const columns = value[itemPartition];
        const columnsDup = [...columns];
        columnsDup[dragIndex] = columns[hoverIndex];
        columnsDup[hoverIndex] = columns[dragIndex];
        updateDisplayedValue({ ...value, [itemPartition]: columnsDup });
        item.index = hoverIndex;
      } else if (partitionName !== itemPartition && dragIndex !== hoverIndex) {
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
