/* eslint-disable react/prop-types */
import cx from "classnames";
import { Droppable, Draggable } from "react-beautiful-dnd";
import { t } from "ttag";

import { DragDropContext } from "metabase/core/components/DragDropContext";
import CS from "metabase/css/core/index.css";
import { moveElement } from "metabase/lib/arrays";

import ChartSettingFieldPicker from "./ChartSettingFieldPicker";
import { AddAnotherContainer } from "./ChartSettingFieldsPicker.styled";

const ChartSettingFieldsPicker = ({
  value: fields = [],
  options,
  onChange,
  addAnother,
  showColumnSetting,
  showColumnSettingForIndicies,
  ...props
}) => {
  const handleDragEnd = ({ source, destination }) => {
    const oldIndex = source.index;
    const newIndex = destination.index;
    onChange(moveElement(fields, oldIndex, newIndex));
  };

  const calculateOptions = field => {
    return options.filter(
      option =>
        fields.findIndex(v => v === option.value) < 0 || option.value === field,
    );
  };

  const isDragDisabled = fields?.length <= 1;

  return (
    <div>
      {fields?.length >= 0 ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="droppable">
            {provided => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {fields.map((field, fieldIndex) => {
                  return (
                    <Draggable
                      key={`draggable-${field}`}
                      draggableId={`draggable-${field}`}
                      index={fieldIndex}
                      isDragDisabled={isDragDisabled}
                    >
                      {provided => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={CS.mb1}
                        >
                          <ChartSettingFieldPicker
                            {...props}
                            showColumnSetting={
                              showColumnSetting ||
                              showColumnSettingForIndicies?.includes(fieldIndex)
                            }
                            key={fieldIndex}
                            value={field}
                            options={calculateOptions(field)}
                            onChange={updatedField => {
                              const fieldsCopy = [...fields];
                              // this swaps the position of the existing value
                              const existingIndex =
                                fields.indexOf(updatedField);
                              if (existingIndex >= 0) {
                                fieldsCopy.splice(
                                  existingIndex,
                                  1,
                                  fields[fieldIndex],
                                );
                              }
                              // replace with the new value
                              fieldsCopy.splice(fieldIndex, 1, updatedField);
                              onChange(fieldsCopy);
                            }}
                            onRemove={
                              fields.filter(field => field != null).length >
                                1 ||
                              (fields.length > 1 && field == null)
                                ? () =>
                                    onChange([
                                      ...fields.slice(0, fieldIndex),
                                      ...fields.slice(fieldIndex + 1),
                                    ])
                                : null
                            }
                            showDragHandle={fields.length > 1}
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
        <span className={CS.textError}>{t`error`}</span>
      )}
      {addAnother && (
        <AddAnotherContainer>
          <a
            className={cx(CS.textBrand, CS.textBold, CS.py1)}
            onClick={() => {
              const remaining = options.filter(
                o => fields.indexOf(o.value) < 0,
              );
              if (remaining.length === 1) {
                // if there's only one unused option, use it
                onChange(fields.concat([remaining[0].value]));
              } else {
                // otherwise leave it blank
                onChange(fields.concat([undefined]));
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
