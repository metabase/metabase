import type Question from "metabase-lib/v1/Question";
import type { Dashboard, Dataset } from "metabase-types/api";

export type DatasetResponse = {
  body: Dataset;
};

export type DashcardQueryResponse = {
  body: Dataset;
};

export type SandboxableItems = {
  dashboard: Dashboard;
  questions: Question[];
};
