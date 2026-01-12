import { useFormikContext } from "formik";
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrevious } from "react-use";
import { isEqual } from "underscore";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useListRecentsQuery } from "metabase/api";
import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import {
  canPlaceEntityInCollection,
  getEntityTypeFromCardType,
  isInstanceAnalyticsCollection,
} from "metabase/collections/utils";
import { FormProvider } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId, DashboardId } from "metabase-types/api";

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
  targetCollection?: CollectionId;
  saveToDashboard?: DashboardId;
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
  targetCollection: userTargetCollection,
  children,
}: PropsWithChildren<SaveQuestionProps>) => {
  const [originalQuestion] = useState(latestOriginalQuestion); // originalQuestion from props changes during saving

  const defaultCollectionId = useGetDefaultCollectionId(
    originalQuestion?.collectionId(),
  );

  const currentUser = useSelector(getCurrentUser);

  const targetCollection =
    userTargetCollection === "personal" && currentUser
      ? currentUser.personal_collection_id
      : userTargetCollection;

  const { data: recentItems } = useListRecentsQuery({
    context: ["selections"],
  });

  const lastSelectedEntityModel = useMemo(() => {
    return recentItems?.find(
      (item) => item.model === "collection" || item.model === "dashboard",
    );
  }, [recentItems]);

  // we only care about the most recently select dashboard or collection
  const lastSelectedCollection =
    lastSelectedEntityModel?.model === "collection"
      ? lastSelectedEntityModel
      : undefined;

  const lastSelectedDashboard =
    lastSelectedEntityModel?.model === "dashboard"
      ? lastSelectedEntityModel
      : undefined;

  // analytics questions should not default to saving in dashboard
  const isAnalytics = isInstanceAnalyticsCollection(question.collection());

  const entityType = getEntityTypeFromCardType(question.type());

  const isValidLastSelectedCollection =
    lastSelectedCollection &&
    canPlaceEntityInCollection(
      entityType,
      lastSelectedCollection.collection_type,
    );

  const initialDashboardId =
    question.type() === "question" &&
    !isAnalytics &&
    // `userTargetCollection` comes from the `targetCollection` sdk prop and should take precedence over the recent dashboards
    userTargetCollection === undefined &&
    lastSelectedDashboard?.can_write
      ? lastSelectedDashboard?.id
      : undefined;

  const initialCollectionId =
    (!isAnalytics
      ? lastSelectedDashboard?.parent_collection.id
      : defaultCollectionId) ??
    (isValidLastSelectedCollection ? lastSelectedCollection?.id : undefined) ??
    defaultCollectionId;

  const initialValues: FormValues = useMemo(
    () =>
      getInitialValues(
        originalQuestion,
        question,
        initialCollectionId,
        initialDashboardId,
      ),
    [originalQuestion, initialCollectionId, initialDashboardId, question],
  );

  const handleSubmit = useCallback(
    async (details: FormValues) =>
      submitQuestion({
        originalQuestion,
        details,
        question,
        onSave,
        onCreate,
        targetCollection,
      }),
    [originalQuestion, question, onSave, onCreate, targetCollection],
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

  const saveToDashboard =
    originalQuestion || !question.creationType()
      ? undefined
      : (question.dashboardId() ?? undefined);

  return (
    <FormProvider
      initialValues={initialValues}
      onSubmit={handleSubmit}
      validationSchema={SAVE_QUESTION_SCHEMA}
    >
      {({ values, setValues }) => (
        <FormValuesPatcher nextValues={initialValues}>
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
              targetCollection,
              saveToDashboard,
            }}
          >
            {children}
          </SaveQuestionContext.Provider>
        </FormValuesPatcher>
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

/**
 * Patches form values when `nextValues` change asynchronously (e.g., after API calls).
 *
 * Terminology:
 * - "changed": nextValues differs from prevValues (new data arrived)
 * - "untouched": formValues[key] === prevValues[key] (user hasn't edited this field)
 * - "modified": formValues[key] !== prevValues[key] (user has edited this field)
 *
 * For each changed field:
 * - If untouched → apply the new value (safe to update)
 * - If modified → preserve user's input (don't overwrite)
 *
 * Uses deep comparison to correctly handle nested object values.
 */
export const FormValuesPatcher = <T extends object>({
  nextValues,
  children,
}: PropsWithChildren<{ nextValues: T }>) => {
  const { values: formValues, setValues } = useFormikContext<T>();
  const prevValues = usePrevious(nextValues);

  useEffect(() => {
    if (!prevValues || isEqual(nextValues, prevValues)) {
      return;
    }
    const patches: Partial<T> = {};
    for (const key of Object.keys(nextValues) as (keyof T)[]) {
      if (isEqual(formValues[key], prevValues[key])) {
        /**
         * While comparison is deep, patching is shallow.
         * This works for SaveQuestionForm since all fields are primitives. If reused with nested
         * objects, consider implementing deep/recursive patching to preserve user edits
         * within nested structures.
         */
        patches[key] = nextValues[key];
      }
    }
    if (Object.keys(patches).length > 0) {
      setValues({ ...formValues, ...patches });
    }
  }, [nextValues, prevValues, formValues, setValues]);

  return children;
};
