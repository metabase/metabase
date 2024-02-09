import type { DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

export interface AuditInfoState extends State {
  plugins: {
    auditInfo: {
      isLoading: boolean;
      isComplete: boolean;
      data: {
        dashboard_overview: DashboardId;
        question_overview: number;
      };
    };
  };
}
