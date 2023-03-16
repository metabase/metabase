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

import { getForm, getFormValidationSchema } from "metabase/actions/utils";

import type {
  ActionFormInitialValues,
  ActionFormSettings,
  FieldSettings,
  WritebackParameter,
  Parameter,
  ParametersForActionExecution,
} from "metabase-types/api";

import ActionFormFieldWidget from "../ActionFormFieldWidget";
import FormFieldEditor from "../../containers/ActionCreator/FormCreator/FormFieldEditor";
import {
  ActionFormButtonContainer,
  FormFieldEditorDragContainer,
} from "./ActionForm.styled";

import { reorderFields } from "./utils";

interface ActionFormProps {
  parameters: WritebackParameter[] | Parameter[];
  initialValues?: ActionFormInitialValues;
  formSettings?: ActionFormSettings;
  isEditable?: boolean;
  submitTitle?: string;
  submitButtonColor?: string;
  setFormSettings?: (formSettings: ActionFormSettings) => void;
  onSubmit: (
    params: ParametersForActionExecution,
    actions: FormikHelpers<ParametersForActionExecution>,
  ) => void;
  onClose?: () => void;
}

export const ActionForm = ({
  parameters,
  initialValues = {},
  formSettings,
  isEditable = false,
  submitTitle,
  submitButtonColor = "primary",
  setFormSettings,
  onSubmit,
  onClose,
}: ActionFormProps): JSX.Element => {
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

  const formInitialValues = useMemo(
    () => formValidationSchema.cast(initialValues),
    [initialValues, formValidationSchema],
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

  if (isSettings) {
    const fieldSettings = formSettings.fields || {};
    return (
      <FormProvider
        initialValues={formInitialValues}
        enableReinitialize
        onSubmit={onSubmit}
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
    );
  }

  return (
    <FormProvider
      initialValues={formInitialValues}
      validationSchema={formValidationSchema}
      onSubmit={onSubmit}
      enableReinitialize
    >
      <Form role="form" data-testid="action-form">
        {form.fields.map(field => (
          <ActionFormFieldWidget key={field.name} formField={field} />
        ))}

        <ActionFormButtonContainer>
          {onClose && (
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
          )}
          <FormSubmitButton
            title={submitTitle ?? t`Submit`}
            {...submitButtonVariant}
          />
        </ActionFormButtonContainer>

        <FormErrorMessage />
      </Form>
    </FormProvider>
  );
};
