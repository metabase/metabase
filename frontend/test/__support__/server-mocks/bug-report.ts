import fetchMock from "fetch-mock";

export const setupBugReportEndpoints = (responses = [{ success: true }]) => {
  fetchMock.post(
    "path:/api/slack/bug-report",
    { status: 200, body: responses[0] },
    {
      delay: 0,
    },
  );
};
