import type Question from "metabase-lib/v1/Question";
import type { Dashboard, DatasetData } from "metabase-types/api";

export type DatasetResponse = {
  body: {
    data: DatasetData;
  };
};

export type DashcardQueryResponse = {
  body: {
    data: DatasetData;
  };
};

export type SandboxableItems = {
  dashboard: Dashboard;
  questions: Question[];
};
