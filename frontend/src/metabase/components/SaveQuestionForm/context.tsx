import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useListCollectionsQuery } from "metabase/api";
import { FormProvider } from "metabase/forms";
import { isSavedQuestionChanged } from "metabase/query_builder/utils/question";
import type Question from "metabase-lib/v1/Question";

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
};

export const SaveQuestionContext =
  createContext<SaveQuestionContextType | null>(null);

export const SaveQuestionProvider = ({
  question,
  originalQuestion: latestOriginalQuestion,
  onCreate,
  onSave,
  multiStep = false,
  initialCollectionId,
  children,
}: PropsWithChildren<SaveQuestionProps>) => {
  const { data: collections = [] } = useListCollectionsQuery({});
  const [originalQuestion] = useState(latestOriginalQuestion); // originalQuestion from props changes during saving

  const initialValues: FormValues = useMemo(
    () =>
      getInitialValues(
        collections,
        originalQuestion,
        question,
        initialCollectionId,
      ),
    [collections, initialCollectionId, originalQuestion, question],
  );

  const handleSubmit = useCallback(
    async (details: FormValues) =>
      submitQuestion(originalQuestion, details, question, onSave, onCreate),
    [originalQuestion, question, onSave, onCreate],
  );

  const isQuestionChanged = isSavedQuestionChanged(question, originalQuestion);

  const showSaveType =
    isQuestionChanged &&
    originalQuestion != null &&
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
