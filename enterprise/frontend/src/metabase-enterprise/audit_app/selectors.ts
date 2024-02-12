import type { AuditInfoState } from "./types/state";

export const isAuditInfoLoading = (state: AuditInfoState) => {
  const {
    plugins: { auditInfo },
  } = state;
  return auditInfo.isLoading;
};

export const isAuditInfoComplete = (state: AuditInfoState) => {
  const {
    plugins: { auditInfo },
  } = state;
  return auditInfo.isComplete;
};

export const getDashboardOverviewId = (state: AuditInfoState) =>
  state.plugins.auditInfo.data?.dashboard_overview ?? undefined;
export const getQuestionOverviewId = (state: AuditInfoState) =>
  state.plugins.auditInfo.data?.question_overview ?? undefined;
