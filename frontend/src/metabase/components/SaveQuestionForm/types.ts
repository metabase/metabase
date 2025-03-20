import type Question from "metabase-lib/v1/Question";
import type {
  CollectionId,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";

export type SaveQuestionProps<C = CollectionId> = {
  question: Question;
  originalQuestion: Question | null;
  onCreate: (
    question: Question,
    options?: {
      dashboardTabId?: DashboardTabId;
    },
  ) => Promise<Question>;
  onSave: (question: Question) => Promise<void>;

  closeOnSuccess?: boolean;
  multiStep?: boolean;
  initialCollectionId?: CollectionId | null;
  initialDashboardTabId?: number | null | undefined;

  /**
   * The target collection to save the question to.
   * Currently used for the embedding SDK.
   *
   * When this is defined, the collection picker will be hidden and
   * the question will be saved to this collection.
   **/
  targetCollection?: C;
};

export type FormValues = {
  saveType: "overwrite" | "create";
  collection_id: CollectionId | null | undefined;
  dashboard_id: DashboardId | null | undefined;
  // specifically not using DashboardTabId type here, so that
  // if that type is ever extended to be something beyond number
  // we type error to avoid parsing a string as an int
  dashboard_tab_id: `${number}` | null | undefined;
  name: string;
  description: string;
};

export type UpdateQuestionOptions = {
  newQuestion: Question;
  originalQuestion: Question;
  onSave: (question: Question) => Promise<void>;
};

export type CreateQuestionOptions = {
  details: FormValues;
  question: Question;
  onCreate: (
    question: Question,
    options?: {
      dashboardTabId?: DashboardTabId | undefined;
    },
  ) => Promise<Question>;
} & Pick<SaveQuestionProps, "targetCollection">;

export type SubmitQuestionOptions = CreateQuestionOptions & {
  originalQuestion: Question | null;
  onSave: (question: Question) => Promise<void>;
};
