import type {
  DataTestRun,
  DataTestRunUser,
  DataTestRunWithUser,
  ListDataTestRunsResponse,
} from "metabase-types/api";

export function createMockDataTestRun(
  opts?: Partial<DataTestRun>,
): DataTestRun {
  return {
    id: 1,
    test_type: "transform",
    test_id: 1,
    initiated_by: 1,
    start_time: "2026-01-01T00:00:00Z",
    end_time: "2026-01-01T00:00:02Z",
    status: "passed",
    last_heartbeat: "2026-01-01T00:00:02Z",
    ...opts,
  };
}

export function createMockDataTestRunUser(
  opts?: Partial<DataTestRunUser>,
): DataTestRunUser {
  return {
    id: 1,
    email: "user@example.com",
    first_name: "Test",
    last_name: "User",
    common_name: "Test User",
    ...opts,
  };
}

export function createMockDataTestRunWithUser(
  opts?: Partial<DataTestRunWithUser>,
): DataTestRunWithUser {
  return {
    ...createMockDataTestRun(),
    initiated_by_user: createMockDataTestRunUser(),
    ...opts,
  };
}

export function createMockListDataTestRunsResponse(
  opts?: Partial<ListDataTestRunsResponse>,
): ListDataTestRunsResponse {
  return {
    data: [],
    limit: 20,
    offset: 0,
    total: 0,
    ...opts,
  };
}
