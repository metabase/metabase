import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { DragSource, DropTarget } from "react-dnd";
import _ from "underscore";

import Grabber from "metabase/components/Grabber";

const ChartSettingFieldsPartition = ({ value = {}, partitions, onChange }) => (
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

@DropTarget(
  "columns",
  {
    canDrop: (props, monitor) => true,
    drop: ({ partitionName }, monitor, component) => ({ partitionName }),
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
          columns.map(col => (
            <Column
              partitionName={partitionName}
              column={col}
              value={value}
              onChange={onChange}
            />
          ))
        )}
      </div>,
    );
  }
}

@DragSource(
  "columns",
  {
    beginDrag: ({ column, partitionName }) => ({ column, partitionName }),
    endDrag: ({ value, onChange }, monitor, component) => {
      if (!monitor.didDrop()) {
        return;
      }

      const { column, partitionName: oldPartition } = monitor.getItem();
      const { partitionName: newPartition } = monitor.getDropResult();
      if (newPartition === oldPartition) {
        // dropped in the starting partition
        return;
      }

      onChange({
        ...value,
        // remove column from old partition
        [oldPartition]: value[oldPartition].filter(
          col => !_.isEqual(col.field_ref, column.field_ref),
        ),
        // add it to the new one
        [newPartition]: [...value[newPartition], column],
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
    const { column, connectDragSource, isDragging } = this.props;
    return connectDragSource(
      <div
        className={cx(
          "text-dark p1 mb1 bordered rounded dropshadow text-bold flex justify-between",
          { disabled: isDragging },
        )}
      >
        {column.display_name}
        <Grabber style={{ width: 10 }} />
      </div>,
    );
  }
}

export default ChartSettingFieldsPartition;
