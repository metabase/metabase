import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { DragSource, DropTarget } from "react-dnd";
import _ from "underscore";

import Grabber from "metabase/components/Grabber";

const ChartSettingFieldsPartition = ({ value = {}, partitions, onChange }) => {
  return (
    <div>
      {partitions.map(({ name, title }, index) => (
        <div className={cx("py2", { "border-top": index > 0 })}>
          <h4 className="mb2">{title}</h4>
          <Partition
            partitionName={name}
            columns={value[name]}
            value={value}
            onChange={onChange}
          />
        </div>
      ))}
    </div>
  );
};

@DropTarget(
  "columns",
  {
    canDrop: (props, monitor) => true,
    drop: ({ partitionName }, monitor, component) => {
      if (monitor.didDrop()) {
        return;
      }
      return { partitionName };
    },
  },
  (connect, monitor) => ({ connectDropTarget: connect.dropTarget() }),
)
class Partition extends React.Component {
  render() {
    const {
      columns = [],
      partitionName,
      connectDropTarget,
      value,
      onChange,
    } = this.props;
    return connectDropTarget(
      <div>
        {columns.length === 0 ? (
          <div>{t`Drag fields here`}</div>
        ) : (
          columns.map((col, index) => (
            <Column
              partitionName={partitionName}
              column={col}
              index={index}
              value={value}
              onChange={onChange}
            />
          ))
        )}
      </div>,
    );
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

      if (dragIndex === hoverIndex) {
        return;
      }

      if (props.partitionName === itemPartition) {
        props.onChange({
          ...props.value,
          [itemPartition]: swap(
            props.value[itemPartition],
            dragIndex,
            hoverIndex,
          ),
        });
        item.index = hoverIndex;
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
    endDrag: ({ value, onChange }, monitor, component) => {
      if (!monitor.didDrop()) {
        return;
      }

      const {
        column: targetColumn,
        partitionName: newPartition,
      } = monitor.getDropResult();

      const { column, partitionName: oldPartition } = monitor.getItem();

      if (targetColumn && _.isEqual(column.field_ref, targetColumn.field_ref)) {
        return;
      }

      value = {
        ...value,
        // remove column from old partition
        [oldPartition]: value[oldPartition].filter(
          col => !_.isEqual(col.field_ref, column.field_ref),
        ),
      };

      const targetIndex =
        targetColumn == null
          ? value[newPartition].length
          : value[newPartition].findIndex(col =>
              _.isEqual(col.field_ref, targetColumn.field_ref),
            );

      onChange({
        ...value,
        // add it to the new one
        [newPartition]: [
          ...value[newPartition].slice(0, targetIndex),
          column,
          ...value[newPartition].slice(targetIndex),
        ],
      });
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
