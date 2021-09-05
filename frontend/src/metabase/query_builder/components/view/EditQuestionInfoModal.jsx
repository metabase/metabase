/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Questions from "metabase/entities/questions";
import CollapseSection from "metabase/components/CollapseSection";

import { CacheTTLFieldContainer } from "./EditQuestionInfoModal.styled";

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
      const visibleFields = formFields.filter(
        field => field.name !== "cache_ttl",
      );
      const hasCacheTTLField = visibleFields.length !== formFields.length;
      return (
        <Form>
          {visibleFields.map(field => (
            <FormField key={field.name} name={field.name} />
          ))}
          {hasCacheTTLField && (
            <CollapseSection
              header={t`More options`}
              iconVariant="up-down"
              iconPosition="right"
            >
              <CacheTTLField>
                <FormField name="cache_ttl" hasMargin={false} />
              </CacheTTLField>
            </CollapseSection>
          )}
          <FormFooter submitTitle={t`Save`} onCancel={onClose} />
        </Form>
      );
    }}
  </Questions.ModalForm>
);

function CacheTTLField({ children }) {
  return (
    <CacheTTLFieldContainer>
      <span>{t`Cache all question results for`}</span>
      {children}
      <span>{t`hours`}</span>
    </CacheTTLFieldContainer>
  );
}

export default EditQuestionInfoModal;
