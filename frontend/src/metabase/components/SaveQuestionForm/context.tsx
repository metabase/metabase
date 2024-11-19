import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { FormProvider } from "metabase/forms";
import { isNotNull } from "metabase/lib/types";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

import { SAVE_QUESTION_SCHEMA } from "./schema";
import type { FormValues, SaveQuestionProps } from "./types";
import { getInitialValues, submitQuestion } from "./util";

type SaveQuestionContextType = {
  question: Question;
  originalQuestion: Question | null;
  initialValues: FormValues;
  handleSubmit: (details: FormValues) => Promise<void>;
  values: FormValues;
  setValues: (values: FormValues) => void;
  showSaveType: boolean;
  multiStep: boolean;
  saveToCollectionId?: CollectionId;
};

export const SaveQuestionContext =
  createContext<SaveQuestionContextType | null>(null);

/*
 * Why are we using these useState calls?
 *
 * When we use SaveQuestionModal within the QueryModals, the 'opened' prop on the modal
 * is always true. What this means is that the rendering of the modal is controlled by parent components,
 * and when the modal component opens, the modified question is passed into the provider. When the provider is rendered,
 * we calculate isSavedQuestionInitiallyChanged, the question and originalQuestion are different, so the form works as
 * it should.
 *
 * When we use the Modal's props to control the modal itself (i.e. no outside component controlling
 * the modal), the question and originalQuestion are the same when they are passed in to the provider
 * so isSavedQuestionInitiallyChanged will calculate to false and then *never* change because it's saved
 * as a state variable. This means that, to use this provider, we have to make sure that the question
 * and the original question are different *at the time of the Provider rendering*.
 *
 * Thanks for coming to my TED talk.
 * */
export const SaveQuestionProvider = ({
  question,
  originalQuestion: latestOriginalQuestion,
  onCreate,
  onSave,
  multiStep = false,
  saveToCollectionId,
  children,
}: PropsWithChildren<SaveQuestionProps>) => {
  const [originalQuestion] = useState(latestOriginalQuestion); // originalQuestion from props changes during saving

  const defaultCollectionId = useGetDefaultCollectionId(
    originalQuestion?.collectionId(),
  );

  const initialValues: FormValues = useMemo(
    () => getInitialValues(originalQuestion, question, defaultCollectionId),
    [originalQuestion, defaultCollectionId, question],
  );

  const handleSubmit = useCallback(
    async (details: FormValues) =>
      submitQuestion({
        originalQuestion,
        details,
        question,
        onSave,
        onCreate,
        saveToCollectionId,
      }),
    [originalQuestion, question, onSave, onCreate, saveToCollectionId],
  );

  // we care only about the very first result as question can be changed before
  // the modal is closed
  const [isSavedQuestionInitiallyChanged] = useState(
    isNotNull(originalQuestion) && question.isDirtyComparedTo(originalQuestion),
  );

  const showSaveType =
    isSavedQuestionInitiallyChanged &&
    originalQuestion != null &&
    originalQuestion.type() !== "model" &&
    originalQuestion.type() !== "metric" &&
    originalQuestion.canWrite();

  return (
    <FormProvider
      initialValues={{ ...initialValues }}
      onSubmit={handleSubmit}
      validationSchema={SAVE_QUESTION_SCHEMA}
      enableReinitialize
    >
      {({ values, setValues }) => (
        <SaveQuestionContext.Provider
          value={{
            question,
            originalQuestion,
            initialValues,
            handleSubmit,
            values,
            setValues,
            showSaveType,
            multiStep,
            saveToCollectionId,
          }}
        >
          {children}
        </SaveQuestionContext.Provider>
      )}
    </FormProvider>
  );
};

export const useSaveQuestionContext = () => {
  const context = useContext(SaveQuestionContext);
  if (!context) {
    throw new Error(
      "useSaveQuestionModalContext must be used within a SaveQuestionModalProvider",
    );
  }
  return context;
};
