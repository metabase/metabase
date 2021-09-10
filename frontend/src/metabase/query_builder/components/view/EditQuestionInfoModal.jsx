/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";
import CollapseSection from "metabase/components/CollapseSection";

import Questions from "metabase/entities/questions";

const COLLAPSED_FIELDS = ["cache_ttl"];

function EditQuestionInfoModal({ question, onClose, onSave }) {
  const onSubmit = useCallback(
    async card => {
      await onSave({ ...question.card(), ...card });
      onClose();
    },
    [question, onSave, onClose],
  );

  return (
    <ModalContent title={t`Edit question`} onClose={onClose}>
      <Form
        initialValues={question.card()}
        form={Questions.forms.edit}
        onSubmit={onSubmit}
      >
        {({ Form, FormField, FormFooter, formFields }) => {
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
                    <FormField
                      key={field.name}
                      name={field.name}
                      question={question}
                    />
                  ))}
                </CollapseSection>
              )}
              <FormFooter submitTitle={t`Save`} onCancel={onClose} />
            </Form>
          );
        }}
      </Form>
    </ModalContent>
  );
}

export default EditQuestionInfoModal;
