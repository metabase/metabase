import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { DragSource, DropTarget } from "react-dnd";
import _ from "underscore";
import styled from "styled-components";
import colors, { lighten } from "metabase/lib/colors";

import Label from "metabase/components/type/Label";
import Grabber from "metabase/components/Grabber";

const ColumnDragger = styled.div`
  padding: 12px 14px;
  box-shadow: 0 2px 3px ${lighten(colors["text-dark"], 1.5)};
  &:hover {
    box-shadow: 0 2px 5px ${lighten(colors["text-dark"], 1.3)};
    transition: all 300ms linear;
  }
`;

class ChartSettingFieldsPartition extends React.Component {
  constructor(props) {
    super(props);
    this.state = { displayedValue: null };
  }

  updateDisplayedValue = displayedValue =>
    this.setState({
      displayedValue: _.mapObject(displayedValue, cols =>
        cols.map(col => col.field_ref),
      ),
    });
  commitDisplayedValue = () => {
    const { displayedValue } = this.state;
    if (displayedValue != null) {
      this.props.onChange(displayedValue);
      this.setState({ displayedValue: null });
    }
  };

  render() {
    const value = _.mapObject(
      this.state.displayedValue || this.props.value || {},
      fieldRefs =>
        fieldRefs
          .map(field_ref =>
            this.props.columns.find(col => _.isEqual(col.field_ref, field_ref)),
          )
          .filter(col => col != null),
    );
    return (
      <div>
        {this.props.partitions.map(({ name, title, columnFilter }, index) => (
          <Partition
            className={cx("py2", { "border-top": index > 0 })}
            title={title}
            columnFilter={columnFilter}
            partitionName={name}
            columns={value[name]}
            value={value}
            updateDisplayedValue={this.updateDisplayedValue}
            commitDisplayedValue={this.commitDisplayedValue}
          />
        ))}
      </div>
    );
  }
}

@DropTarget(
  "columns",
  {
    // Using a drop target here is a hack to work around another issue.
    // The version of react-dnd we're on has a bug where endDrag isn't called.
    // Drop is still called here, so we trigger commit here.
    drop: (props, monitor, component) => {
      props.commitDisplayedValue();
    },
  },
  (connect, monitor) => ({ connectDropTarget: connect.dropTarget() }),
)
class Partition extends React.Component {
  render() {
    const {
      columns = [],
      partitionName,
      columnFilter,
      updateDisplayedValue,
      commitDisplayedValue,
      value,
      connectDropTarget,
      title,
      className,
    } = this.props;
    return connectDropTarget(
      <div className={className}>
        <Label color="medium">{title}</Label>
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
      </div>,
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
    return this.props.connectDropTarget(
      <div className="p2 text-centered bg-light rounded text-medium">{t`Drag fields here`}</div>,
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
      const hoverIndex = props.index;
      const { value, partitionName, updateDisplayedValue } = props;
      if (partitionName === itemPartition && dragIndex !== hoverIndex) {
        const columns = value[itemPartition];
        const columnsDup = [...columns];
        columnsDup[dragIndex] = columns[hoverIndex];
        columnsDup[hoverIndex] = columns[dragIndex];
        updateDisplayedValue({ ...value, [itemPartition]: columnsDup });
        item.index = hoverIndex;
      } else if (partitionName !== itemPartition) {
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
      // props.commitDisplayedValue();
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
        <div>
          <ColumnDragger
            className={cx(
              "text-dark mb1 bordered rounded cursor-grab text-bold flex justify-between",
              { disabled: isDragging },
            )}
          >
            {column.display_name}
            <Grabber style={{ width: 10 }} />
          </ColumnDragger>
        </div>,
      ),
    );
  }
}

export default ChartSettingFieldsPartition;
