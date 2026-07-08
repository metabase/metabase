export interface AnalyticsExportState {
  status?: "in-progress" | "complete" | "error";
  message?: string;
}
