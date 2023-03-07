import React, { useMemo } from "react";
import { t } from "ttag";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

import type {
  DraggableProvided,
  OnDragEndResponder,
  DroppableProvided,
} from "react-beautiful-dnd";
import type { FormikHelpers } from "formik";

import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";

import type {
  ActionFormInitialValues,
  ActionFormSettings,
  FieldSettings,
  WritebackParameter,
  Parameter,
  ParametersForActionExecution,
} from "metabase-types/api";

import { reorderFields } from "metabase/actions/containers/ActionCreator/FormCreator";
import { FormFieldWidget } from "./ActionFormFieldWidget";
import FormFieldEditor from "./FormFieldEditor";
import {
  ActionFormButtonContainer,
  FormFieldEditorDragContainer,
} from "./ActionForm.styled";

import { getForm, getFormValidationSchema } from "./utils";

export interface ActionFormComponentProps {
  parameters: WritebackParameter[] | Parameter[];
  initialValues?: ActionFormInitialValues;
  isEditable?: boolean;
  onClose?: () => void;
  onSubmit?: (
    params: ParametersForActionExecution,
    actions: FormikHelpers<ParametersForActionExecution>,
  ) => void;
  submitTitle?: string;
  submitButtonColor?: string;
  formSettings?: ActionFormSettings;
  setFormSettings?: (formSettings: ActionFormSettings) => void;
}

export const ActionForm = ({
  parameters,
  initialValues = {},
  isEditable = false,
  onClose,
  onSubmit,
  submitTitle,
  submitButtonColor = "primary",
  formSettings,
  setFormSettings,
}: ActionFormComponentProps): JSX.Element => {
  // allow us to change the color of the submit button
  const submitButtonVariant = { [submitButtonColor]: true };

  const isSettings = !!(formSettings && setFormSettings);

  const form = useMemo(
    () => getForm(parameters, formSettings?.fields),
    [parameters, formSettings?.fields],
  );

  const formValidationSchema = useMemo(
    () => getFormValidationSchema(parameters, formSettings?.fields),
    [parameters, formSettings?.fields],
  );

  const handleDragEnd: OnDragEndResponder = ({ source, destination }) => {
    if (!isSettings) {
      return;
    }

    const oldOrder = source.index;
    const newOrder = destination?.index ?? source.index;

    const reorderedFields = reorderFields(
      formSettings.fields ?? {},
      oldOrder,
      newOrder,
    );
    setFormSettings({
      ...formSettings,
      fields: reorderedFields,
    });
  };

  const handleChangeFieldSettings = (newFieldSettings: FieldSettings) => {
    if (!isSettings || !newFieldSettings?.id) {
      return;
    }

    setFormSettings({
      ...formSettings,
      fields: {
        ...formSettings.fields,
        [newFieldSettings.id]: newFieldSettings,
      },
    });
  };

  const handleSubmit = (
    values: ParametersForActionExecution,
    actions: FormikHelpers<ParametersForActionExecution>,
  ) => onSubmit?.(formValidationSchema.cast(values), actions);

  if (isSettings) {
    const fieldSettings = formSettings.fields || {};
    return (
      <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
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
    );
  }

  const hasFormFields = !!form.fields.length;

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={formValidationSchema}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      {({ dirty }) => (
        <Form
          disabled={!dirty && hasFormFields}
          role="form"
          data-testid="action-form"
        >
          {form.fields.map(field => (
            <FormFieldWidget key={field.name} formField={field} />
          ))}

          <ActionFormButtonContainer>
            {onClose && <Button onClick={onClose}>{t`Cancel`}</Button>}
            <FormSubmitButton
              disabled={!dirty && hasFormFields}
              title={submitTitle ?? t`Submit`}
              {...submitButtonVariant}
            />
          </ActionFormButtonContainer>

          <FormErrorMessage />
        </Form>
      )}
    </FormProvider>
  );
};
