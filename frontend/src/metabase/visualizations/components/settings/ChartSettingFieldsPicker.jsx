/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import ChartSettingFieldPicker from "./ChartSettingFieldPicker";
import { AddAnotherContainer } from "./ChartSettingFieldsPicker.styled";

const ChartSettingFieldsPicker = ({
  value = [],
  options,
  onChange,
  addAnother,
  ...props
}) => {
  const handleDragEnd = ({ source, destination }) => {
    const oldIndex = source.index,
      newIndex = destination.index;

    const valueCopy = [...value];
    valueCopy.splice(newIndex, 0, valueCopy.splice(oldIndex, 1)[0]);
    onChange(valueCopy);
  };

  const calculateOptions = item => {
    return options.filter(
      option =>
        value.findIndex(v => v === option.value) < 0 || option.value === item,
    );
  };

  return (
    <div>
      {Array.isArray(value) ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="droppable">
            {provided => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {value.map((v, index) => {
                  console.log(v);
                  return (
                    <Draggable key={v} draggableId={v} index={index}>
                      {provided => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="mb1"
                        >
                          <ChartSettingFieldPicker
                            {...props}
                            key={index}
                            value={v}
                            options={calculateOptions(v)}
                            onChange={v => {
                              const newValue = [...value];
                              // this swaps the position of the existing value
                              const existingIndex = value.indexOf(v);
                              if (existingIndex >= 0) {
                                newValue.splice(existingIndex, 1, value[index]);
                              }
                              // replace with the new value
                              newValue.splice(index, 1, v);
                              onChange(newValue);
                            }}
                            onRemove={
                              value.filter(v => v != null).length > 1 ||
                              (value.length > 1 && v == null)
                                ? () =>
                                    onChange([
                                      ...value.slice(0, index),
                                      ...value.slice(index + 1),
                                    ])
                                : null
                            }
                            dragHandle={value.length > 1}
                          />
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <span className="text-error">{t`error`}</span>
      )}
      {addAnother && (
        <AddAnotherContainer>
          <a
            className="text-brand text-bold py1"
            onClick={() => {
              const remaining = options.filter(o => value.indexOf(o.value) < 0);
              if (remaining.length === 1) {
                // if there's only one unused option, use it
                onChange(value.concat([remaining[0].value]));
              } else {
                // otherwise leave it blank
                onChange(value.concat([undefined]));
              }
            }}
          >
            {addAnother}
          </a>
        </AddAnotherContainer>
      )}
    </div>
  );
};

export default ChartSettingFieldsPicker;
