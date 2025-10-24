import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, useSensor } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Sortable } from "metabase/common/components/Sortable";
import { Form, FormProvider } from "metabase/forms";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { Flex, Icon, UnstyledButton } from "metabase/ui";
import type {
  ActionFormSettings,
  FieldSettings,
  Parameter,
  WritebackAction,
} from "metabase-types/api";

import {
  getDefaultFormSettings,
  getForm,
  getFormValidationSchema,
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
  onClose?: () => void;
}

export function FormCreator({
  parameters,
  formSettings: passedFormSettings,
  isEditable,
  actionType,
  onChange,
  onClose,
}: FormCreatorProps) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });

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
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!formSettings.fields || !over || active.id === over.id) {
        return;
      }

      // Get the ordered fields to determine indices
      const fieldsWithIds = _.mapObject(formSettings.fields, (field, key) => ({
        ...field,
        id: key,
      }));
      const orderedFields = _.sortBy(Object.values(fieldsWithIds), "order");

      const oldIndex = orderedFields.findIndex(
        (field) => field.id === active.id,
      );
      const newIndex = orderedFields.findIndex((field) => field.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const reorderedFields = reorderFields(
        formSettings.fields,
        oldIndex,
        newIndex,
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
          {onClose && (
            /* We want to avoid absolute positioning, so we use margin with z-index since
               it's covered by the next element with padding */
            <Flex
              justify="flex-end"
              mt="1.5rem"
              mb="-3rem"
              style={{ zIndex: 1 }}
            >
              <UnstyledButton onClick={onClose}>
                <Icon name="close" size={18} />
              </UnstyledButton>
            </Flex>
          )}
          <EmptyFormPlaceholder />
        </FormContainer>
      </SidebarContent>
    );
  }

  const fieldSettings = formSettings.fields || {};

  const showWarning = form.fields.some((field) => {
    const settings = fieldSettings[field.name];

    if (!settings) {
      return false;
    }

    if (actionType === "implicit") {
      const parameter = parameters.find(
        (parameter) => parameter.id === settings.id,
      );

      return parameter?.required && settings.hidden;
    }

    return (
      settings.hidden && settings.required && settings.defaultValue == null
    );
  });

  return (
    <SidebarContent title={t`Action parameters`} onClose={onClose}>
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
            <DndContext
              onDragEnd={handleDragEnd}
              sensors={[pointerSensor]}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={form.fields.map((field) => field.name)}
                strategy={verticalListSortingStrategy}
              >
                {form.fields.map((field) => (
                  <Sortable
                    key={field.name}
                    id={field.name}
                    disabled={!isEditable}
                    as={FormFieldEditorDragContainer}
                    draggingStyle={{ opacity: 0.5 }}
                  >
                    {({ dragHandleRef, dragHandleListeners }) => (
                      // <DragOverlay>
                      <FormFieldEditor
                        field={field}
                        fieldSettings={fieldSettings[field.name]}
                        isEditable={isEditable}
                        onChange={handleChangeFieldSettings}
                        dragHandleRef={dragHandleRef}
                        dragHandleListeners={dragHandleListeners}
                      />
                      // </DragOverlay>
                    )}
                  </Sortable>
                ))}
              </SortableContext>
            </DndContext>
          </Form>
        </FormProvider>
      </FormContainer>
    </SidebarContent>
  );
}
