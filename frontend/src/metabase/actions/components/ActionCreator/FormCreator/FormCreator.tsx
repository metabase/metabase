import React, { useState, useEffect, useMemo } from "react";
import { t } from "ttag";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

import type {
  DraggableProvided,
  OnDragEndResponder,
  DroppableProvided,
} from "react-beautiful-dnd";
import type { Parameter } from "metabase-types/types/Parameter";
import type { ActionFormSettings, FieldSettings } from "metabase-types/api";

import { addMissingSettings } from "metabase/entities/actions/utils";

import {
  getDefaultFormSettings,
  getDefaultFieldSettings,
  reorderFields,
  sortActionParams,
  hasNewParams,
} from "./utils";

import { FormField } from "./FormField";
import { EmptyFormPlaceholder } from "./EmptyFormPlaceholder";
import { FieldSettingsButtons } from "./FieldSettingsButtons";

import {
  FormItemWrapper,
  FormCreatorWrapper,
  FormItemName,
} from "./FormCreator.styled";

export function FormCreator({
  params,
  formSettings: passedFormSettings,
  onChange,
  onExampleClick,
}: {
  params: Parameter[];
  formSettings?: ActionFormSettings;
  onChange: (formSettings: ActionFormSettings) => void;
  onExampleClick: () => void;
}) {
  const [formSettings, setFormSettings] = useState<ActionFormSettings>(
    passedFormSettings?.fields ? passedFormSettings : getDefaultFormSettings(),
  );

  useEffect(() => {
    onChange(formSettings);
  }, [formSettings, onChange]);

  useEffect(() => {
    // add default settings for new parameters
    if (formSettings && params && hasNewParams(params, formSettings)) {
      setFormSettings(addMissingSettings(formSettings, params));
    }
  }, [params, formSettings]);

  const handleChangeFieldSettings = (
    paramId: string,
    newFieldSettings: FieldSettings,
  ) => {
    setFormSettings({
      ...formSettings,
      fields: {
        ...formSettings.fields,
        [paramId]: newFieldSettings,
      },
    });
  };

  const handleDragEnd: OnDragEndResponder = ({ source, destination }) => {
    const oldOrder = source.index;
    const newOrder = destination?.index ?? source.index;

    const reorderedFields = reorderFields(
      formSettings.fields,
      oldOrder,
      newOrder,
    );
    setFormSettings({
      ...formSettings,
      fields: reorderedFields,
    });
  };

  const sortedParams = useMemo(
    () => params.sort(sortActionParams(formSettings)),
    [params, formSettings],
  );

  return (
    <FormCreatorWrapper>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="action-form-droppable">
          {(provided: DroppableProvided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              {sortedParams.map((param, index) => (
                <Draggable
                  key={`draggable-${param.id}`}
                  draggableId={param.id}
                  index={index}
                >
                  {(provided: DraggableProvided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className="mb1"
                    >
                      <FormItem
                        key={param.id}
                        param={param}
                        fieldSettings={
                          formSettings.fields?.[param.id] ??
                          getDefaultFieldSettings()
                        }
                        onChange={(newSettings: FieldSettings) =>
                          handleChangeFieldSettings(param.id, newSettings)
                        }
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {!params.length && (
                <EmptyFormPlaceholder onExampleClick={onExampleClick} />
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </FormCreatorWrapper>
  );
}

function FormItem({
  param,
  fieldSettings,
  onChange,
}: {
  param: Parameter;
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}) {
  const name = param["display-name"] ?? param.name;

  return (
    <FormItemWrapper>
      <FormItemName>
        {name}
        {!!fieldSettings.required && " *"}
      </FormItemName>
      <FormField param={param} fieldSettings={fieldSettings} />
      <FieldSettingsButtons fieldSettings={fieldSettings} onChange={onChange} />
    </FormItemWrapper>
  );
}
