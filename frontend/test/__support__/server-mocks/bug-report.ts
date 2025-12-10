import fetchMock from "fetch-mock";

import type { MetabaseInfo } from "metabase-types/api";
import { createMockMetabaseInfo } from "metabase-types/api/mocks";

export const setupBugReportEndpoints = (responses = [{ success: true }]) => {
  fetchMock.post(
    "path:/api/slack/bug-report",
    { status: 200, body: responses[0] },
    {
      delay: 0,
    },
  );
};

export const setupBugReportingDetailsEndpoint = (
  info: Partial<MetabaseInfo> = {},
) => {
  fetchMock.get(
    "path:/api/bug-reporting/details",
    createMockMetabaseInfo(info),
  );
};
