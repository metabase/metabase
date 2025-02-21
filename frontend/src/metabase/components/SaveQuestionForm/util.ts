import { P, match } from "ts-pattern";
import { t } from "ttag";

import { canonicalCollectionId } from "metabase/collections/utils";
import { isNullOrUndefined } from "metabase/lib/types";
import type Question from "metabase-lib/v1/Question";
import type { CardType } from "metabase-types/api";

import type {
  CreateQuestionOptions,
  FormValues,
  SubmitQuestionOptions,
  UpdateQuestionOptions,
} from "./types";

const updateQuestion = async (options: UpdateQuestionOptions) => {
  const { originalQuestion, newQuestion, onSave } = options;

  const collectionId = canonicalCollectionId(originalQuestion.collectionId());
  const displayName = originalQuestion.displayName();
  const description = originalQuestion.description();

  const updatedQuestion = newQuestion
    .setDisplayName(displayName)
    .setDescription(description)
    .setCollectionId(collectionId);

  await onSave(updatedQuestion.setId(originalQuestion.id()));
};

export const createQuestion = async (options: CreateQuestionOptions) => {
  const { details, question, onCreate, saveToCollectionId } = options;

  if (details.saveType !== "create") {
    return;
  }

  // `saveToCollectionId` is used to override the target collection of the question,
  // this is mainly used for the embedding SDK.
  const collectionId = canonicalCollectionId(
    isNullOrUndefined(saveToCollectionId)
      ? details.collection_id
      : saveToCollectionId,
  );
  const dashboardId = details.dashboard_id;

  const displayName = details.name.trim();
  const description = details.description ? details.description.trim() : null;

  const newQuestion = question
    .setDisplayName(displayName)
    .setDescription(description)
    .setCollectionId(collectionId)
    .setDashboardId(dashboardId);

  return onCreate(newQuestion, { dashboardTabId: details.tab_id || undefined });
};

export async function submitQuestion(options: SubmitQuestionOptions) {
  const {
    originalQuestion,
    details,
    question,
    onSave,
    onCreate,
    saveToCollectionId,
  } = options;

  if (details.saveType === "overwrite" && originalQuestion) {
    await updateQuestion({
      originalQuestion,
      newQuestion: question,
      onSave,
    });
  } else {
    await createQuestion({
      question,
      details,
      onCreate,
      saveToCollectionId,
    });
  }
}

export const getInitialValues = (
  originalQuestion: Question | null,
  question: Question,
  initialCollectionId: FormValues["collection_id"],
  initialDashboardId: FormValues["dashboard_id"],
  initialDashboardTabId: FormValues["tab_id"],
): FormValues => {
  const isReadonly = originalQuestion != null && !originalQuestion.canWrite();

  const getOriginalNameModification = (originalQuestion: Question | null) =>
    originalQuestion
      ? t`${originalQuestion.displayName()} - Modified`
      : undefined;

  const dashboardId =
    question.dashboardId() === undefined || isReadonly
      ? initialDashboardId
      : question.dashboardId();

  const collectionId =
    question.collectionId() === undefined || isReadonly
      ? initialCollectionId
      : question.collectionId();

  return {
    name:
      // Saved question
      getOriginalNameModification(originalQuestion) ||
      // Ad-hoc query
      question.generateQueryDescription() ||
      "",
    description:
      originalQuestion?.description() || question.description() || "",
    collection_id: collectionId,
    dashboard_id: dashboardId,
    tab_id: initialDashboardTabId,
    saveType:
      originalQuestion &&
      originalQuestion.type() === "question" &&
      originalQuestion.canWrite()
        ? "overwrite"
        : "create",
  };
};

export const getTitle = (
  cardType: CardType,
  showSaveType: boolean = false,
  multiStep: boolean = false,
): string => {
  const stepType = multiStep ? "multiStep" : "singleStep";

  return match<[CardType, typeof stepType, boolean]>([
    cardType,
    stepType,
    showSaveType,
  ])
    .returnType<string>()
    .with(["question", "singleStep", true], () => t`Save question`)
    .with(["question", "singleStep", false], () => t`Save new question`)
    .with(["question", "multiStep", P._], () => t`First, save your question`)
    .with(["model", "singleStep", P._], () => t`Save model`)
    .with(["model", "multiStep", P._], () => t`First, save your model`)
    .with(["metric", "singleStep", P._], () => t`Save metric`)
    .with(["metric", "multiStep", P._], () => t`First, save your metric`)
    .exhaustive();
};

export const getPlaceholder = (cardType: CardType): string =>
  match<CardType, string>(cardType)
    .with("question", () => t`What is the name of your question?`)
    .with("model", () => t`What is the name of your model?`)
    .with("metric", () => t`What is the name of your metric?`)
    .exhaustive();
