import { P, match } from "ts-pattern";
import { t } from "ttag";

import { canonicalCollectionId } from "metabase/collections/utils";
import type Question from "metabase-lib/v1/Question";
import type { CardType, DashboardTabId } from "metabase-types/api";

import type { FormValues } from "./types";

const updateQuestion = async (
  originalQuestion: Question,
  newQuestion: Question,
  onSave: (question: Question) => Promise<void>,
) => {
  const collectionId = canonicalCollectionId(originalQuestion.collectionId());
  const displayName = originalQuestion.displayName();
  const description = originalQuestion.description();

  const updatedQuestion = newQuestion
    .setDisplayName(displayName)
    .setDescription(description)
    .setCollectionId(collectionId);

  await onSave(updatedQuestion.setId(originalQuestion.id()));
};

export const createQuestion = async (
  details: FormValues,
  question: Question,
  onCreate: (
    question: Question,
    options?: {
      dashboardTabId?: DashboardTabId | undefined;
    },
  ) => Promise<Question>,
) => {
  if (details.saveType !== "create") {
    return;
  }

  const collectionId = canonicalCollectionId(details.collection_id);
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

export async function submitQuestion(
  originalQuestion: Question | null,
  details: FormValues,
  question: Question,
  onSave: (question: Question) => Promise<void>,
  onCreate: (
    question: Question,
    options?: {
      dashboardTabId?: DashboardTabId | undefined;
    },
  ) => Promise<Question>,
) {
  if (details.saveType === "overwrite" && originalQuestion) {
    await updateQuestion(originalQuestion, question, onSave);
  } else {
    return await createQuestion(details, question, onCreate);
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

  return {
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
    dashboard_id:
      question.dashboardId() === undefined || isReadonly
        ? initialDashboardId
        : question.dashboardId(),
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
