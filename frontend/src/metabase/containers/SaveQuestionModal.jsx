import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { assoc } from "icepick";

import { CSSTransitionGroup } from "react-transition-group";

import Form, { FormField, FormFooter } from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";
import Radio from "metabase/components/Radio";

import Question from "metabase-lib/lib/Question";
import { generateQueryDescription } from "metabase/lib/query/description";

import validate from "metabase/lib/validate";

import { t } from "ttag";

import "./SaveQuestionModal.css";

SaveQuestionModal.propTypes = {
  question: PropTypes.instanceOf(Question).isRequired,
  originalQuestion: PropTypes.instanceOf(Question),
  tableMetadata: PropTypes.object, // can't be required, sometimes null
  onCreate: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  multiStep: PropTypes.bool,
  initialCollectionId: PropTypes.number,
};

export default SaveQuestionModal;

function SaveQuestionModal({
  question,
  originalQuestion,
  tableMetadata,
  onCreate,
  onSave,
  onClose,
  multiStep,
  initialCollectionId,
}) {
  const handleSubmit = useCallback(
    async details => {
      const isOverwriting = details.saveType === "overwrite";

      const newQuestion = isOverwriting
        ? question
            .setDisplayName(originalQuestion.displayName())
            .setDescription(originalQuestion.description())
            .setCollectionId(originalQuestion.collectionId())
        : question
            .setDisplayName(details.name.trim())
            .setDescription(
              details.description ? details.description.trim() : null,
            )
            .setCollectionId(details.collection_id);

      if (details.saveType === "create") {
        await onCreate(newQuestion.card());
      } else if (details.saveType === "overwrite") {
        const card = assoc(newQuestion.card(), "id", originalQuestion.id());
        await onSave(card);
      }
    },
    [onCreate, onSave, originalQuestion, question],
  );

  const isStructured = question.isStructured();

  const initialValues = {
    name:
      question.displayName() || isStructured
        ? generateQueryDescription(tableMetadata, question.query().query)
        : "",
    description: question.description() || "",
    collection_id:
      question.collectionId() === undefined
        ? initialCollectionId
        : question.collectionId(),
    saveType: originalQuestion ? "overwrite" : "create",
  };

  const title = multiStep ? t`First, save your question` : t`Save question`;

  const showSaveType = !question.id() && !!originalQuestion;
  return (
    <ModalContent id="SaveQuestionModal" title={title} onClose={onClose}>
      <Form
        initialValues={initialValues}
        fields={[
          { name: "saveType" },
          { name: "name" },
          { name: "description" },
          { name: "collection_id" },
        ]}
        onSubmit={handleSubmit}
        overwriteOnInitialValuesChange
      >
        {({ values, Form }) => (
          <Form>
            <FormField
              name="saveType"
              title={t`Replace or save as new?`}
              type={SaveTypeInput}
              hidden={!showSaveType}
              originalQuestion={originalQuestion}
            />
            <CSSTransitionGroup
              transitionName="saveQuestionModalFields"
              transitionEnterTimeout={500}
              transitionLeaveTimeout={500}
            >
              {values.saveType === "create" && (
                <div className="saveQuestionModalFields">
                  <FormField
                    name="name"
                    title={t`Name`}
                    placeholder={t`What is the name of your card?`}
                    validate={
                      values.saveType === "create" ? validate.required() : null
                    }
                  />
                  <FormField
                    name="description"
                    type="text"
                    title={t`Description`}
                    placeholder={t`It's optional but oh, so helpful`}
                  />
                  <FormField
                    name="collection_id"
                    title={t`Which collection should this go in?`}
                    type="collection"
                  />
                </div>
              )}
            </CSSTransitionGroup>
            <FormFooter submitTitle={t`Save`} onCancel={onClose} />
          </Form>
        )}
      </Form>
    </ModalContent>
  );
}

SaveTypeInput.propTypes = {
  field: PropTypes.object,
  originalQuestion: PropTypes.instanceOf(Question),
};

function SaveTypeInput({ field, originalQuestion }) {
  return (
    <Radio
      {...field}
      options={[
        {
          name: t`Replace original question, "${originalQuestion &&
            originalQuestion.displayName()}"`,
          value: "overwrite",
        },
        { name: t`Save as new question`, value: "create" },
      ]}
      vertical
    />
  );
}
