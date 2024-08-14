/* eslint-disable react/prop-types */
import cx from "classnames";
import { splice } from "icepick";
import { Component } from "react";
import { Droppable, Draggable } from "react-beautiful-dnd";
import { t } from "ttag";
import _ from "underscore";

import Label from "metabase/components/type/Label";
import { DragDropContext } from "metabase/core/components/DragDropContext";
import CS from "metabase/css/core/index.css";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import {
  DroppableContainer,
  FieldPartitionColumn,
  EmptyColumnPlaceholder,
} from "./ChartSettingFieldsPartition.styled";

const columnMove = (columns, from, to) => {
  const columnCopy = [...columns];
  columnCopy.splice(to, 0, columnCopy.splice(from, 1)[0]);
  return columnCopy;
};

const columnRemove = (columns, from) => {
  return splice(columns, from, 1);
};

const columnAdd = (columns, to, column) => {
  return splice(columns, to, 0, column);
};

class ChartSettingFieldsPartition extends Component {
  constructor(props) {
    super(props);
  }

  handleEditFormatting = (column, targetElement) => {
    if (column) {
      this.props.onShowWidget(
        {
          id: "column_settings",
          props: {
            initialKey: getColumnKey(column),
          },
        },
        targetElement,
      );
    }
  };

  getPartitionType = partitionName => {
    switch (partitionName) {
      case "rows":
      case "columns":
        return "dimension";
      default:
        return "metric";
    }
  };

  handleDragEnd = ({ source, destination }) => {
    if (!source || !destination) {
      return;
    }
    const { value, onChange } = this.props;
    const { droppableId: sourcePartition, index: sourceIndex } = source;
    const { droppableId: destinationPartition, index: destinationIndex } =
      destination;

    if (
      sourcePartition === destinationPartition &&
      sourceIndex !== destinationIndex
    ) {
      onChange({
        ...value,
        [sourcePartition]: columnMove(
          value[sourcePartition],
          sourceIndex,
          destinationIndex,
        ),
      });
    } else if (sourcePartition !== destinationPartition) {
      const column = value[sourcePartition][sourceIndex];
      onChange({
        ...value,
        [sourcePartition]: columnRemove(value[sourcePartition], sourceIndex),
        [destinationPartition]: columnAdd(
          value[destinationPartition],
          destinationIndex,
          column,
        ),
      });
    }
  };

  render() {
    const value = _.mapObject(this.props.value || {}, fieldRefs =>
      fieldRefs
        .map(field_ref =>
          this.props.columns.find(col => _.isEqual(col.field_ref, field_ref)),
        )
        .filter(col => col != null),
    );

    const { getColumnTitle } = this.props;
    return (
      <DragDropContext onDragEnd={this.handleDragEnd}>
        {this.props.partitions.map(({ name: partitionName, title }, index) => {
          const columns = value[partitionName] ?? [];
          const partitionType = this.getPartitionType(partitionName);
          return (
            <div
              className={cx(CS.py2, { [CS.borderTop]: index > 0 })}
              key={partitionName}
            >
              <Label color="medium">{title}</Label>
              <Droppable droppableId={partitionName} type={partitionType}>
                {(provided, snapshot) => (
                  <DroppableContainer
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    isDragSource={!!snapshot.draggingFromThisWith}
                  >
                    {columns.length === 0 ? (
                      <EmptyColumnPlaceholder>{t`Drag fields here`}</EmptyColumnPlaceholder>
                    ) : (
                      columns.map((col, index) => (
                        <Draggable
                          key={`draggable-${col.display_name}`}
                          draggableId={`draggable-${col.display_name}`}
                          index={index}
                        >
                          {provided => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={CS.mb1}
                            >
                              <Column
                                key={`${partitionName}-${col.display_name}`}
                                column={col}
                                index={index}
                                onEditFormatting={this.handleEditFormatting}
                                title={getColumnTitle(col)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </DroppableContainer>
                )}
              </Droppable>
            </div>
          );
        })}
      </DragDropContext>
    );
  }
}

class Column extends Component {
  constructor(props) {
    super(props);
  }

  handleEditFormatting = target => {
    const { column, onEditFormatting } = this.props;
    onEditFormatting && onEditFormatting(column, target);
  };

  render() {
    const { title } = this.props;
    return (
      <FieldPartitionColumn
        title={title}
        onEdit={this.handleEditFormatting}
        draggable
        isDisabled={false}
      />
    );
  }
}

export default ChartSettingFieldsPartition;
