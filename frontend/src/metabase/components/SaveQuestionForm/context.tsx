import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { FormProvider } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { getIsSavedQuestionChanged } from "metabase/query_builder/selectors";
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
  children,
}: PropsWithChildren<SaveQuestionProps>) => {
  const [originalQuestion] = useState(latestOriginalQuestion); // originalQuestion from props changes during saving

  const defaultCollectionId = PLUGIN_COLLECTIONS.useGetDefaultCollectionId(
    originalQuestion?.collectionId(),
  );

  const initialValues: FormValues = useMemo(
    () => getInitialValues(originalQuestion, question, defaultCollectionId),
    [originalQuestion, defaultCollectionId, question],
  );

  const handleSubmit = useCallback(
    async (details: FormValues) =>
      submitQuestion(originalQuestion, details, question, onSave, onCreate),
    [originalQuestion, question, onSave, onCreate],
  );

  const isSavedQuestionChanged = useSelector(getIsSavedQuestionChanged);
  // we care only about the very first result as question can be changed before
  // the modal is closed
  const [isSavedQuestionInitiallyChanged] = useState(isSavedQuestionChanged);

  const showSaveType =
    isSavedQuestionInitiallyChanged &&
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
