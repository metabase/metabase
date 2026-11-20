import type { DataTestRunId, DataTestRunStatus } from "metabase-types/api";

export type DataTestRunListParams = {
  page?: number;
  statuses?: DataTestRunStatus[];
  startTime?: string;
  endTime?: string;
};

export function dataTestRuns(
  testUrl: string,
  { page, statuses, startTime, endTime }: DataTestRunListParams = {},
) {
  const searchParams = new URLSearchParams();
  if (page != null) {
    searchParams.set("page", String(page));
  }
  statuses?.forEach((status) => {
    searchParams.append("statuses", status);
  });
  if (startTime != null) {
    searchParams.set("start-time", startTime);
  }
  if (endTime != null) {
    searchParams.set("end-time", endTime);
  }
  const queryString = searchParams.toString();
  const baseUrl = `${testUrl}/runs`;
  return queryString.length > 0 ? `${baseUrl}?${queryString}` : baseUrl;
}

export function dataTestRun(testUrl: string, runId: DataTestRunId) {
  return `${testUrl}/runs/${runId}`;
}
