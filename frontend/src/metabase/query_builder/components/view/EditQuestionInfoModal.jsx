/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";
import CollapseSection from "metabase/components/CollapseSection";

import { PLUGIN_CACHING } from "metabase/plugins";
import Questions from "metabase/entities/questions";

const COLLAPSED_FIELDS = ["cache_ttl"];

function getInitialCacheTTL(question) {
  // If a question doesn't have an explicitly set cache TTL,
  // its results can still be cached with a db-level cache TTL
  // or with an instance level setting
  return (
    question.card().cache_ttl ||
    PLUGIN_CACHING.getQuestionsImplicitCacheTTL(question)
  );
}

function cleanValues(question, values) {
  const isCachedImplicitly =
    PLUGIN_CACHING.getQuestionsImplicitCacheTTL(question) === values.cache_ttl;

  // If a question doesn't have an explicitly set cache TTL,
  // we display database / instance default value as a default.
  // In this way, it's more clear and visible how the results are going to be cached
  // Still, we don't want to submit the implicit value
  // Otherwise, the cache_ttl will be set on card,
  // and when the database / instance default cache TTL change
  // it can be unexpected that the card now has its own cache TTL
  return isCachedImplicitly
    ? { ...values, cache_ttl: question.card().cache_ttl }
    : values;
}

const mapDispatchToProps = {
  updateQuestion: Questions.actions.update,
};

function EditQuestionInfoModal({ question, updateQuestion, onClose, onSave }) {
  const onSubmit = useCallback(
    async values => {
      const card = cleanValues(question, values);
      await updateQuestion({ id: card.id }, card);
      await onSave({ ...question.card(), ...card });
      onClose();
    },
    [question, updateQuestion, onSave, onClose],
  );

  return (
    <ModalContent title={t`Edit question`} onClose={onClose}>
      <Form
        initialValues={{
          ...question.card(),
          cache_ttl: getInitialCacheTTL(question),
        }}
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
                    <FormField key={field.name} name={field.name} />
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

export default connect(
  null,
  mapDispatchToProps,
)(EditQuestionInfoModal);
