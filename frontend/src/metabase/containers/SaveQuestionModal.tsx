import React, { Component } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import { t } from "ttag";
import * as Yup from "yup";

import ModalContent from "metabase/components/ModalContent";
import FormProvider from "metabase/core/components/FormProvider/FormProvider";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { Form } from "metabase/core/components/Form";
import { FormInput } from "metabase/core/components/FormInput";
import { FormFooter } from "metabase/core/components/FormFooter";
import { FormTextArea } from "metabase/core/components/FormTextArea";
import { FormErrorMessage } from "metabase/core/components/FormErrorMessage";
import { Button } from "metabase/core/components/Button";
import { FormSubmitButton } from "metabase/core/components/FormSubmitButton";
import { FormRadio } from "metabase/core/components/FormRadio";
import { canonicalCollectionId } from "metabase/collections/utils";
import { CollectionId } from "metabase-types/api";
import * as Errors from "metabase/core/utils/errors";
import Question from "metabase-lib/Question";

import "./SaveQuestionModal.css";

const getSingleStepTitle = (questionType: string, showSaveType: boolean) => {
  if (questionType === "model") {
    return t`Save model`;
  } else if (showSaveType) {
    return t`Save question`;
  }

  return t`Save new question`;
};

const SAVE_QUESTION_SCHEMA = Yup.object({
  saveType: Yup.string(),
  name: Yup.string().when("saveType", {
    // We don't care if the form is valid when overwrite mode is enabled,
    // as original question's data will be submitted instead of the form values
    is: (value: string) => value !== "overwrite",
    then: Yup.string().required(Errors.required),
    otherwise: Yup.string().nullable(true),
  }),
});

interface SaveQuestionModalProps {
  question: Question;
  originalQuestion: Question | null;
  onCreate: (question: Question) => void;
  onSave: (question: Question) => Promise<void>;
  onClose: () => void;
  multiStep?: boolean;
  initialCollectionId?: number;
}

interface FormValues {
  saveType: string;
  collection_id: CollectionId | null | undefined;
  name: string;
  description: string;
}

const isOverwriteMode = (
  question: Question | null,
  saveType: string,
): question is Question => {
  return saveType === "overwrite";
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class SaveQuestionModal extends Component<SaveQuestionModalProps> {
  handleSubmit = async (details: FormValues) => {
    const { originalQuestion } = this.props;

    if (isOverwriteMode(originalQuestion, details.saveType)) {
      await this.handleOverwrite(originalQuestion, details);
    } else {
      await this.handleCreate(details);
    }
  };

  async handleOverwrite(originalQuestion: Question, details: FormValues) {
    const { question, onSave } = this.props;

    const collectionId = canonicalCollectionId(originalQuestion.collectionId());
    const displayName = originalQuestion.displayName();
    const description = originalQuestion.description();

    const newQuestion = question
      .setDisplayName(displayName)
      .setDescription(description)
      .setCollectionId(collectionId);

    await onSave(newQuestion.setId(originalQuestion.id()));
  }

  async handleCreate(details: FormValues) {
    if (details.saveType !== "create") {
      return;
    }

    const { question, onCreate } = this.props;

    const collectionId = canonicalCollectionId(details.collection_id);
    const displayName = details.name.trim();
    const description = details.description ? details.description.trim() : null;

    const newQuestion = question
      .setDisplayName(displayName)
      .setDescription(description)
      .setCollectionId(collectionId);

    await onCreate(newQuestion);
  }

  render() {
    const { question, originalQuestion, initialCollectionId } = this.props;

    const isReadonly = originalQuestion != null && !originalQuestion.canWrite();

    const initialValues: FormValues = {
      name: question.generateQueryDescription(),
      description: question.description() || "",
      collection_id:
        question.collectionId() === undefined || isReadonly
          ? initialCollectionId
          : question.collectionId(),
      saveType:
        originalQuestion &&
        !originalQuestion.isDataset() &&
        originalQuestion.canWrite()
          ? "overwrite"
          : "create",
    };

    const questionType = question.isDataset() ? "model" : "question";

    const multiStepTitle =
      questionType === "question"
        ? t`First, save your question`
        : t`First, save your model`;

    const showSaveType =
      !question.isSaved() &&
      !!originalQuestion &&
      !originalQuestion.isDataset() &&
      originalQuestion.canWrite();

    const singleStepTitle = getSingleStepTitle(questionType, showSaveType);

    const title = this.props.multiStep ? multiStepTitle : singleStepTitle;

    const nameInputPlaceholder =
      questionType === "question"
        ? t`What is the name of your question?`
        : t`What is the name of your model?`;

    return (
      <ModalContent
        id="SaveQuestionModal"
        title={title}
        onClose={this.props.onClose}
      >
        <FormProvider
          initialValues={initialValues}
          onSubmit={this.handleSubmit}
          validationSchema={SAVE_QUESTION_SCHEMA}
          enableReinitialize
        >
          {({ values }) => (
            <Form>
              {showSaveType && (
                <FormRadio
                  name="saveType"
                  title={t`Replace or save as new?`}
                  options={[
                    {
                      name: t`Replace original question, "${originalQuestion?.displayName()}"`,
                      value: "overwrite",
                    },
                    { name: t`Save as new question`, value: "create" },
                  ]}
                  vertical
                />
              )}
              <TransitionGroup>
                {values.saveType === "create" && (
                  <CSSTransition
                    classNames="saveQuestionModalFields"
                    timeout={{
                      enter: 500,
                      exit: 500,
                    }}
                  >
                    <div className="saveQuestionModalFields">
                      <FormInput
                        autoFocus
                        name="name"
                        title={t`Name`}
                        placeholder={nameInputPlaceholder}
                      />
                      <FormTextArea
                        name="description"
                        title={t`Description`}
                        placeholder={t`It's optional but oh, so helpful`}
                      />
                      <FormCollectionPicker
                        name="collection_id"
                        title={t`Which collection should this go in?`}
                      />
                    </div>
                  </CSSTransition>
                )}
              </TransitionGroup>
              <FormFooter>
                <FormErrorMessage inline />
                <Button
                  type="button"
                  onClick={this.props.onClose}
                >{t`Cancel`}</Button>
                <FormSubmitButton title={t`Save`} primary />
              </FormFooter>
            </Form>
          )}
        </FormProvider>
      </ModalContent>
    );
  }
}
