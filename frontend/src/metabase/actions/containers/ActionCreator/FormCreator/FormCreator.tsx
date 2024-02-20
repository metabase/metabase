import { useEffect, useCallback, useMemo, useState } from "react";
import type {
  DraggableProvided,
  DroppableProvided,
  DropResult,
} from "react-beautiful-dnd";
import { Droppable, Draggable } from "react-beautiful-dnd";
import { t } from "ttag";
import _ from "underscore";

import { DragDropContext } from "metabase/core/components/DragDropContext";
import { Form, FormProvider } from "metabase/forms";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type {
  ActionFormSettings,
  FieldSettings,
  Parameter,
  WritebackAction,
} from "metabase-types/api";

import {
  getForm,
  getFormValidationSchema,
  getDefaultFormSettings,
} from "../../../utils";
import { syncFieldsWithParameters } from "../utils";

import { Description } from "./Description";
import { EmptyFormPlaceholder } from "./EmptyFormPlaceholder";
import {
  FormContainer,
  FormFieldEditorDragContainer,
  WarningBanner,
} from "./FormCreator.styled";
import FormFieldEditor from "./FormFieldEditor";
import { reorderFields } from "./utils";

// FormEditor's can't be submitted as it serves as a form preview
const ON_SUBMIT_NOOP = _.noop;

interface FormCreatorProps {
  parameters: Parameter[];
  formSettings?: ActionFormSettings;
  isEditable: boolean;
  actionType: WritebackAction["type"];
  onChange: (formSettings: ActionFormSettings) => void;
}

export function FormCreator({
  parameters,
  formSettings: passedFormSettings,
  isEditable,
  actionType,
  onChange,
}: FormCreatorProps) {
  const [formSettings, setFormSettings] = useState<ActionFormSettings>(
    passedFormSettings?.fields ? passedFormSettings : getDefaultFormSettings(),
  );

  useEffect(() => {
    onChange(formSettings);
  }, [formSettings, onChange]);

  useEffect(() => {
    // add default settings for new parameters
    if (formSettings && parameters) {
      setFormSettings(syncFieldsWithParameters(formSettings, parameters));
    }
  }, [parameters, formSettings]);

  const form = useMemo(
    () => getForm(parameters, formSettings.fields),
    [parameters, formSettings.fields],
  );

  // Validation schema here should only be used to get default values
  // for a form preview. We don't want error messages on the preview though.
  const validationSchema = useMemo(
    () => getFormValidationSchema(parameters, formSettings.fields),
    [parameters, formSettings],
  );

  const displayValues = useMemo(
    () => validationSchema.getDefault(),
    [validationSchema],
  );

  const handleDragEnd = useCallback(
    ({ source, destination }: DropResult) => {
      if (!formSettings.fields) {
        return;
      }

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
    },
    [formSettings],
  );

  const handleChangeFieldSettings = useCallback(
    (newFieldSettings: FieldSettings) => {
      if (!newFieldSettings?.id) {
        return;
      }

      setFormSettings({
        ...formSettings,
        fields: {
          ...formSettings.fields,
          [newFieldSettings.id]: newFieldSettings,
        },
      });
    },
    [formSettings],
  );

  if (!parameters.length) {
    return (
      <SidebarContent>
        <FormContainer>
          <EmptyFormPlaceholder />
        </FormContainer>
      </SidebarContent>
    );
  }

  const fieldSettings = formSettings.fields || {};

  const showWarning = form.fields.some(field => {
    const settings = fieldSettings[field.name];

    if (!settings) {
      return false;
    }

    if (actionType === "implicit") {
      const parameter = parameters.find(
        parameter => parameter.id === settings.id,
      );

      return parameter?.required && settings.hidden;
    }

    return (
      settings.hidden && settings.required && settings.defaultValue == null
    );
  });

  return (
    <SidebarContent title={t`Action parameters`}>
      <FormContainer>
        <Description />
        {showWarning && (
          <WarningBanner>
            <b>{t`Heads up.`}</b>{" "}
            {t`Your action has a hidden required field with no default value. There's a good chance this will cause the action to fail.`}
          </WarningBanner>
        )}
        <FormProvider
          enableReinitialize
          initialValues={displayValues}
          onSubmit={ON_SUBMIT_NOOP}
        >
          <Form role="form" data-testid="action-form-editor">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="action-form-droppable">
                {(provided: DroppableProvided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef}>
                    {form.fields.map((field, index) => (
                      <Draggable
                        key={`draggable-${field.name}`}
                        draggableId={field.name}
                        isDragDisabled={!isEditable}
                        index={index}
                      >
                        {(provided: DraggableProvided) => (
                          <FormFieldEditorDragContainer
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                          >
                            <FormFieldEditor
                              field={field}
                              fieldSettings={fieldSettings[field.name]}
                              isEditable={isEditable}
                              onChange={handleChangeFieldSettings}
                            />
                          </FormFieldEditorDragContainer>
                        )}
                      </Draggable>
                    ))}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </Form>
        </FormProvider>
      </FormContainer>
    </SidebarContent>
  );
}
