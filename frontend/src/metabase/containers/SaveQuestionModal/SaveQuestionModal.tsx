import { useCallback, useMemo, useState } from "react";
import { TransitionGroup } from "react-transition-group";
import { t } from "ttag";
import * as Yup from "yup";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { canonicalCollectionId } from "metabase/collections/utils";
import Button from "metabase/core/components/Button";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormFooter from "metabase/core/components/FormFooter";
import FormInput from "metabase/core/components/FormInput";
import FormRadio from "metabase/core/components/FormRadio";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormTextArea from "metabase/core/components/FormTextArea";
import CS from "metabase/css/core/index.css";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_LLM_AUTODESCRIPTION } from "metabase/plugins";
import {
  getIsSavedQuestionChanged,
  getSubmittableQuestion,
} from "metabase/query_builder/selectors";
import { DEFAULT_MODAL_Z_INDEX, Flex, Modal } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

const getLabels = (question: Question, showSaveType: boolean) => {
  const type = question.type();

  if (type === "question") {
    return {
      singleStepTitle: showSaveType ? t`Save question` : t`Save new question`,
      multiStepTitle: t`First, save your question`,
      nameInputPlaceholder: t`What is the name of your question?`,
    };
  }

  if (type === "model") {
    return {
      singleStepTitle: t`Save model`,
      multiStepTitle: t`First, save your model`,
      nameInputPlaceholder: t`What is the name of your model?`,
    };
  }

  throw new Error(`Unknown question.type(): ${type}`);
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
  onCreate: (question: Question) => Promise<void>;
  onSave: (question: Question) => Promise<void>;
  onClose: () => void;
  multiStep?: boolean;
  initialCollectionId?: CollectionId | null;
}

interface FormValues {
  saveType: "overwrite" | "create";
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
  originalQuestion: latestOriginalQuestion,
  onCreate,
  onSave,
  onClose,
  multiStep,
}: SaveQuestionModalProps) => {
  const [originalQuestion] = useState(latestOriginalQuestion); // originalQuestion from props changes during saving
  const isReadonly = originalQuestion != null && !originalQuestion.canWrite();

  const initialCollectionId = useGetDefaultCollectionId(
    originalQuestion?.collectionId(),
  );

  const getOriginalNameModification = (originalQuestion: Question | null) =>
    originalQuestion
      ? t`${originalQuestion.displayName()} - Modified`
      : undefined;

  const initialValues: FormValues = useMemo(
    () => ({
      name:
        // Saved question
        getOriginalNameModification(originalQuestion) ||
        // Ad-hoc query
        question.generateQueryDescription() ||
        "",
      description:
        originalQuestion?.description() || question.description() || "",
      collection_id:
        question.collectionId() === undefined || isReadonly
          ? initialCollectionId
          : question.collectionId(),
      saveType:
        originalQuestion &&
        originalQuestion.type() === "question" &&
        originalQuestion.canWrite()
          ? "overwrite"
          : "create",
    }),
    [initialCollectionId, isReadonly, originalQuestion, question],
  );

  const collectionId = canonicalCollectionId(initialValues.collection_id);
  const questionWithCollectionId: Question =
    question.setCollectionId(collectionId);

  const submittableQuestion = useSelector(state =>
    getSubmittableQuestion(state, questionWithCollectionId),
  );

  const handleOverwrite = useCallback(
    async (originalQuestion: Question) => {
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
        await handleOverwrite(originalQuestion);
      } else {
        await handleCreate(details);
      }
    },
    [originalQuestion, handleOverwrite, handleCreate],
  );

  const isSavedQuestionChanged = useSelector(getIsSavedQuestionChanged);
  // we care only about the very first result as question can be changed before
  // the modal is closed
  const [isSavedQuestionInitiallyChanged] = useState(isSavedQuestionChanged);

  const showSaveType =
    isSavedQuestionInitiallyChanged &&
    originalQuestion != null &&
    originalQuestion.canWrite();

  const { multiStepTitle, singleStepTitle, nameInputPlaceholder } = getLabels(
    question,
    showSaveType,
  );

  const title = multiStep ? multiStepTitle : singleStepTitle;

  return (
    <Modal.Root onClose={onClose} opened={true}>
      <Modal.Overlay />
      <FormProvider
        initialValues={{ ...initialValues }}
        onSubmit={handleSubmit}
        validationSchema={SAVE_QUESTION_SCHEMA}
        enableReinitialize
      >
        {({ values, setValues }) => (
          <Modal.Content p="md" data-testid="save-question-modal">
            <Modal.Header>
              <Modal.Title>{title}</Modal.Title>
              <Flex align="center" justify="flex-end" gap="sm">
                <PLUGIN_LLM_AUTODESCRIPTION.LLMSuggestQuestionInfo
                  question={submittableQuestion}
                  onAccept={nextValues =>
                    setValues({ ...values, ...nextValues })
                  }
                />
                <Modal.CloseButton />
              </Flex>
            </Modal.Header>
            <Modal.Body>
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
                    <div className={CS.overflowHidden}>
                      <FormInput
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
                        zIndex={DEFAULT_MODAL_Z_INDEX + 1}
                      />
                    </div>
                  )}
                </TransitionGroup>
                <FormFooter>
                  <FormErrorMessage inline />
                  <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
                  <FormSubmitButton
                    title={t`Save`}
                    data-testid="save-question-button"
                    primary
                  />
                </FormFooter>
              </Form>
            </Modal.Body>
          </Modal.Content>
        )}
      </FormProvider>
    </Modal.Root>
  );
};
