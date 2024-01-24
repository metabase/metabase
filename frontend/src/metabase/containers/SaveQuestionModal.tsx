import { useCallback, useMemo } from "react";
import { useAsync } from "react-use";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import { t } from "ttag";
import * as Yup from "yup";

import { apiGetCardSummary } from "metabase/query_builder/actions";
import ModalContent from "metabase/components/ModalContent";
import { Form, FormProvider } from "metabase/forms";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { CreateCollectionOnTheGo } from "metabase/containers/CreateCollectionOnTheGo";
import FormInput from "metabase/core/components/FormInput";
import FormFooter from "metabase/core/components/FormFooter";
import FormTextArea from "metabase/core/components/FormTextArea";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import Button from "metabase/core/components/Button";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormRadio from "metabase/core/components/FormRadio";

import { useCollectionListQuery } from "metabase/common/hooks";

import {
  canonicalCollectionId,
  isInstanceAnalyticsCollection,
  getInstanceAnalyticsCustomCollection,
} from "metabase/collections/utils";
import type { CollectionId } from "metabase-types/api";
import * as Errors from "metabase/lib/errors";
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
  onCreate: (question: Question) => Promise<void>;
  onSave: (question: Question) => Promise<void>;
  onClose: () => void;
  multiStep?: boolean;
  initialCollectionId?: CollectionId;
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
  // ! HACK *******************************************
  const state = useSelector(state => state);
  // ! HACK *******************************************

  const { data: collections } = useCollectionListQuery();
  const isReadonly = originalQuestion != null && !originalQuestion.canWrite();

  // we can't use null because that can be ID of the root collection
  const instanceAnalyticsCollectionId =
    collections?.find(isInstanceAnalyticsCollection)?.id ?? "not found";
  const isInInstanceAnalyticsQuestion =
    originalQuestion?.collectionId() === instanceAnalyticsCollectionId;

  if (collections && isInInstanceAnalyticsQuestion) {
    const customCollection = getInstanceAnalyticsCustomCollection(collections);
    if (customCollection) {
      initialCollectionId = customCollection.id;
    }
  }

  const initialValues: FormValues = useMemo(
    () => ({
      name: "",
      description: question.description() || "",
      collection_id:
        question.collectionId() === undefined ||
        isReadonly ||
        isInInstanceAnalyticsQuestion
          ? initialCollectionId
          : question.collectionId(),
      saveType:
        originalQuestion &&
        !originalQuestion.isDataset() &&
        originalQuestion.canWrite()
          ? "overwrite"
          : "create",
    }),
    [
      initialCollectionId,
      isInInstanceAnalyticsQuestion,
      isReadonly,
      originalQuestion,
      question,
    ],
  );

  const suggestCardInfo = useCallback(async () => {
    const collectionId = canonicalCollectionId(initialValues.collection_id);
    const displayName = initialValues.name.trim();
    const description = initialValues.description
      ? initialValues.description.trim()
      : null;

    const newQuestion = question
      .setDisplayName(displayName)
      .setDescription(description)
      .setCollectionId(collectionId);

    return await apiGetCardSummary(newQuestion, state);
  }, [initialValues, question, state]);
  // TODO: Would be nice if we could control the saveType state
  // * in this component and only call useAsync function if you
  // * are in the `create` save type
  const { loading, value } = useAsync(suggestCardInfo, []);
  const { name, description } = useMemo(() => {
    if (value?.summary) {
      return {
        name: value?.summary?.title,
        description: value?.summary?.description,
      };
    }

    return {};
  }, [value]);

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
        <ModalContent
          data-testid="save-question-modal"
          id="SaveQuestionModal"
          title={title}
          onClose={onClose}
        >
          <FormProvider
            initialValues={{
              ...initialValues,
              ...{ name, description },
              ...resumedValues,
            }}
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
                        {loading && <div>Thinking ✨</div>}
                        <FormInput
                          autoFocus
                          name="name"
                          title={t`Name`}
                          placeholder={nameInputPlaceholder}
                        />
                        <FormFooter></FormFooter>
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
