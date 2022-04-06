import { BaseUser } from "metabase-types/api";

export interface ModelCacheRefreshJob {
  id: number;
  status: "completed" | "error";
  model: {
    id: number;
    name: string;
    collection: {
      id: number | null;
      name: string;
    };
  };
  last_run_trigger: "scheduled" | "api";
  last_run_at: string;
  creator: BaseUser;
  updated_by: BaseUser;
}
