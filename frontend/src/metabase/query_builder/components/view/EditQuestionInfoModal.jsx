import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";
import CollapseSection from "metabase/components/CollapseSection";

import { PLUGIN_CACHING } from "metabase/plugins";
import Questions from "metabase/entities/questions";

import { getWritebackEnabled } from "metabase/writeback/selectors";
import { isDatabaseWritebackEnabled } from "metabase/writeback/utils";

const COLLAPSED_FIELDS = ["cache_ttl"];

function mapStateToProps(state) {
  return {
    isWritebackEnabled: getWritebackEnabled(state),
  };
}

const propTypes = {
  question: PropTypes.object.isRequired, // metabase-lib Question instance
  isWritebackEnabled: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

function EditQuestionInfoModal({
  question,
  isWritebackEnabled,
  onClose,
  onSave,
}) {
  const modalTitle = question.isDataset() ? t`Edit model` : t`Edit question`;
  const database = question.database().getPlainObject();
  const hasIsWriteField =
    question.isNative() &&
    !question.isDataset() &&
    isWritebackEnabled &&
    isDatabaseWritebackEnabled(database);

  const onSubmit = useCallback(
    async card => {
      await onSave({ ...question.card(), ...card });
      onClose();
    },
    [question, onSave, onClose],
  );

  const isCachedImplicitly =
    PLUGIN_CACHING.getQuestionsImplicitCacheTTL(question) > 0;

  return (
    <ModalContent title={modalTitle} onClose={onClose}>
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

          const cacheFieldExtraProps = {};
          if (isCachedImplicitly) {
            cacheFieldExtraProps.className = "mt1";
          } else {
            cacheFieldExtraProps.title = null;
          }

          return (
            <Form>
              {visibleFields.map(field => {
                const extraProps = {};
                if (field.name === "is_write" && !hasIsWriteField) {
                  extraProps.type = "hidden";
                }
                return (
                  <FormField
                    key={field.name}
                    name={field.name}
                    {...extraProps}
                  />
                );
              })}
              {collapsedFields.length > 0 && (
                <CollapseSection
                  header={t`More options`}
                  iconVariant="up-down"
                  iconPosition="right"
                  headerClass="text-bold text-medium text-brand-hover"
                  bodyClass="pt2"
                >
                  <FormField
                    name="cache_ttl"
                    question={question}
                    {...cacheFieldExtraProps}
                  />
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

EditQuestionInfoModal.propTypes = propTypes;

export default connect(mapStateToProps)(EditQuestionInfoModal);
