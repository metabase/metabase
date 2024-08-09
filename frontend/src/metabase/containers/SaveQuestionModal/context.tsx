import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useListCollectionsQuery } from "metabase/api";
import { SAVE_QUESTION_SCHEMA } from "metabase/containers/SaveQuestionModal/schema";
import type {
  FormValues,
  SaveQuestionProps,
} from "metabase/containers/SaveQuestionModal/types";
import {
  getInitialValues,
  getPlaceholder,
  getTitle,
  submitQuestion,
} from "metabase/containers/SaveQuestionModal/util";
import { FormProvider } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getIsSavedQuestionChanged } from "metabase/query_builder/selectors";
import type Question from "metabase-lib/v1/Question";

type SaveQuestionContextType = {
  question: Question;
  originalQuestion: Question | null;
  title: string;
  nameInputPlaceholder: string;
  initialValues: FormValues;
  handleSubmit: (details: FormValues) => Promise<void>;
  values: FormValues;
  setValues: (values: FormValues) => void;
  showSaveType: boolean;
};

export const SaveQuestionContext =
  createContext<SaveQuestionContextType | null>(null);

export const SaveQuestionProvider = ({
  question,
  originalQuestion: latestOriginalQuestion,
  onCreate,
  onSave,
  multiStep,
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

  const isSavedQuestionChanged = useSelector(getIsSavedQuestionChanged);
  // we care only about the very first result as question can be changed before
  // the modal is closed
  const [isSavedQuestionInitiallyChanged] = useState(isSavedQuestionChanged);

  const showSaveType =
    isSavedQuestionInitiallyChanged &&
    originalQuestion != null &&
    originalQuestion.canWrite();

  const cardType = question.type();
  const title = getTitle(cardType, showSaveType, multiStep);
  const nameInputPlaceholder = getPlaceholder(cardType);

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
            title,
            nameInputPlaceholder,
            initialValues,
            handleSubmit,
            values,
            setValues,
            showSaveType,
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
