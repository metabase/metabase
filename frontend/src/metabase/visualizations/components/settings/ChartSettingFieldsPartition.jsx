/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import _ from "underscore";
import { splice } from "icepick";

import Label from "metabase/components/type/Label";

import { keyForColumn } from "metabase-lib/lib/queries/utils/dataset";
import {
  DroppableContainer,
  FieldPartitionColumn,
  EmptyColumnPlaceholder,
} from "./ChartSettingFieldsPartition.styled";

class ChartSettingFieldsPartition extends React.Component {
  constructor(props) {
    super(props);
  }

  handleEditFormatting = (column, targetElement) => {
    if (column) {
      this.props.onShowWidget(
        {
          id: "column_settings",
          props: {
            initialKey: keyForColumn(column),
          },
        },
        targetElement,
      );
    }
  };

  getPartitionType = partitionName => {
    return partitionName === "rows" || partitionName === "columns"
      ? "dimension"
      : "metric";
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
      const partition = value[sourcePartition];
      const partitionDup = [...partition];

      partitionDup.splice(
        destinationIndex,
        0,
        partitionDup.splice(sourceIndex, 1)[0],
      );

      onChange({ ...value, [sourcePartition]: partitionDup });
    } else if (sourcePartition !== destinationPartition) {
      const column = value[sourcePartition][sourceIndex];
      onChange({
        ...value,
        [sourcePartition]: splice(value[sourcePartition], sourceIndex, 1),
        [destinationPartition]: splice(
          value[destinationPartition],
          destinationIndex,
          0,
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

    return (
      <DragDropContext onDragEnd={this.handleDragEnd}>
        {this.props.partitions.map(({ name: partitionName, title }, index) => {
          const columns = value[partitionName];
          const partitionType = this.getPartitionType(partitionName);
          return (
            <div
              className={cx("py2", { "border-top": index > 0 })}
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
                              className="mb1"
                            >
                              <Column
                                key={`${partitionName}-${col.display_name}`}
                                column={col}
                                index={index}
                                onEditFormatting={this.handleEditFormatting}
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

class Column extends React.Component {
  constructor(props) {
    super(props);
  }

  handleEditFormatting = target => {
    const { column, onEditFormatting } = this.props;
    onEditFormatting && onEditFormatting(column, target);
  };

  render() {
    const { column } = this.props;

    return (
      <FieldPartitionColumn
        title={column.display_name}
        onEdit={this.handleEditFormatting}
        draggable
        isDisabled={false}
      />
    );
  }
}

export default ChartSettingFieldsPartition;
