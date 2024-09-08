import type Question from "metabase-lib/v1/Question";
import type {
  CollectionId,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";

export type SaveQuestionProps = {
  question: Question;
  originalQuestion: Question | null;
  onCreate: (
    question: Question,
    dashboardTabId?: DashboardTabId,
  ) => Promise<Question>;
  onSave: (question: Question) => Promise<void>;

  closeOnSuccess?: boolean;
  multiStep?: boolean;
  initialDashboardTabId?: number | null | undefined;
} & (
  | { initialCollectionId?: null; initialDashboardId?: null }
  | { initialCollectionId: CollectionId; initialDashboardId?: DashboardId }
  | { initialCollectionId: CollectionId; initialDashboardId?: null }
);

export type FormValues = {
  saveType: "overwrite" | "create";
  collection_id: CollectionId | null | undefined;
  dashboard_id: DashboardId | null | undefined;
  tab_id: DashboardTabId | null | undefined;
  name: string;
  description: string;
};
