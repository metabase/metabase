/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import Questions from "metabase/entities/questions";
import CollapseSection from "metabase/components/CollapseSection";

const COLLAPSED_FIELDS = ["cache_ttl"];

const EditQuestionInfoModal = ({ question, onClose, onSave }) => (
  <Questions.ModalForm
    title={t`Edit question`}
    form={Questions.forms.edit}
    question={question.card()}
    onClose={onClose}
    onSaved={async card => {
      await onSave({ ...question.card(), ...card });
      onClose();
    }}
  >
    {({ Form, FormField, FormFooter, formFields, onClose }) => {
      const [visibleFields, collapsedFields] = _.partition(
        formFields,
        field => !COLLAPSED_FIELDS.includes(field.name),
      );
      return (
        <Form>
          {visibleFields.map(field => (
            <FormField key={field.name} name={field.name} />
          ))}
          {collapsedFields.length > 0 && (
            <CollapseSection
              header={t`More options`}
              iconVariant="up-down"
              iconPosition="right"
              headerClass="text-bold text-medium"
              bodyClass="pt1"
            >
              {collapsedFields.map(field => (
                <FormField key={field.name} name={field.name} />
              ))}
            </CollapseSection>
          )}
          <FormFooter submitTitle={t`Save`} onCancel={onClose} />
        </Form>
      );
    }}
  </Questions.ModalForm>
);

export default EditQuestionInfoModal;
