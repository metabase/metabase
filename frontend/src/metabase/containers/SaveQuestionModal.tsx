import { useCallback } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import { t } from "ttag";
import * as Yup from "yup";

import ModalContent from "metabase/components/ModalContent";
import { FormProvider } from "metabase/forms";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { CreateCollectionOnTheGo } from "metabase/containers/CreateCollectionOnTheGo";
import Form from "metabase/core/components/Form";
import FormInput from "metabase/core/components/FormInput";
import FormFooter from "metabase/core/components/FormFooter";
import FormTextArea from "metabase/core/components/FormTextArea";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import Button from "metabase/core/components/Button";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormRadio from "metabase/core/components/FormRadio";
import { canonicalCollectionId } from "metabase/collections/utils";
import type { CollectionId } from "metabase-types/api";
import * as Errors from "metabase/core/utils/errors";
import { getIsSavedQuestionChanged } from "metabase/query_builder/selectors";
import { useSelector } from "metabase/lib/redux";
import type Question from "metabase-lib/Question";

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

export const SaveQuestionModal = ({
  question,
  originalQuestion,
  onCreate,
  onSave,
  onClose,
  multiStep,
  initialCollectionId,
}: SaveQuestionModalProps) => {
  const handleOverwrite = useCallback(
    async (originalQuestion: Question, details: FormValues) => {
      const collectionId = canonicalCollectionId(
        originalQuestion.collectionId(),
      );
      const displayName = originalQuestion.displayName();
      const description = originalQuestion.description();

      const newQuestion = question
        .setDisplayName(displayName)
        .setDescription(description)
        .setCollectionId(collectionId);

      await onSave(newQuestion.setId(originalQuestion.id()));
    },
    [question, onSave],
  );

  const handleCreate = useCallback(
    async (details: FormValues) => {
      if (details.saveType !== "create") {
        return;
      }

      const collectionId = canonicalCollectionId(details.collection_id);
      const displayName = details.name.trim();
      const description = details.description
        ? details.description.trim()
        : null;

      const newQuestion = question
        .setDisplayName(displayName)
        .setDescription(description)
        .setCollectionId(collectionId);

      await onCreate(newQuestion);
    },
    [question, onCreate],
  );

  const handleSubmit = useCallback(
    async (details: FormValues) => {
      if (isOverwriteMode(originalQuestion, details.saveType)) {
        await handleOverwrite(originalQuestion, details);
      } else {
        await handleCreate(details);
      }
    },
    [originalQuestion, handleOverwrite, handleCreate],
  );

  const isReadonly = originalQuestion != null && !originalQuestion.canWrite();

  const initialValues: FormValues = {
    name: question.generateQueryDescription() || "",
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

  const isSavedQuestionChanged = useSelector(getIsSavedQuestionChanged);
  const showSaveType =
    isSavedQuestionChanged &&
    originalQuestion != null &&
    originalQuestion.canWrite();

  const singleStepTitle = getSingleStepTitle(questionType, showSaveType);

  const title = multiStep ? multiStepTitle : singleStepTitle;

  const nameInputPlaceholder =
    questionType === "question"
      ? t`What is the name of your question?`
      : t`What is the name of your model?`;
  return (
    <CreateCollectionOnTheGo>
      {({ resumedValues }) => (
        <ModalContent id="SaveQuestionModal" title={title} onClose={onClose}>
          <FormProvider
            initialValues={{ ...initialValues, ...resumedValues }}
            onSubmit={handleSubmit}
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
                  <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
                  <FormSubmitButton title={t`Save`} primary />
                </FormFooter>
              </Form>
            )}
          </FormProvider>
        </ModalContent>
      )}
    </CreateCollectionOnTheGo>
  );
};
