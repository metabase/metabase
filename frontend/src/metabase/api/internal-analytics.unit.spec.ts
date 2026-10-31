import fetchMock from "fetch-mock";

import {
  findRequests,
  setupInternalAnalyticsEndpoint,
} from "__support__/server-mocks";

import { postInternalAnalytics } from "./internal-analytics";

// The CLJS reporter resolves this module by name at runtime, so rspack is the only thing that
// checks the string. See `post-events!` in src/metabase/analytics/impl.cljs.
const REPORTER_MODULE_NAME = "metabase/api/internal-analytics";

describe("postInternalAnalytics", () => {
  beforeEach(() => {
    setupInternalAnalyticsEndpoint();
  });

  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();
  });

  it("posts a batch to /api/analytics/internal under an events key", async () => {
    // Metrics are namespaced, as the backend allowlist in metabase.analytics.api keys on them.
    await postInternalAnalytics([
      {
        op: "inc",
        metric: "experiment/runs-total",
        labels: { experiment: "my-exp" },
        amount: 1,
      },
      {
        op: "inc",
        metric: "metabase-frontend/analytics-events-dropped",
        labels: null,
        amount: 3,
      },
    ]);

    const posts = await findRequests("POST");
    expect(posts).toHaveLength(1);

    const [{ url, body }] = posts;
    const payload: unknown = body;

    expect(url).toContain("/api/analytics/internal");
    expect(payload).toEqual({
      events: [
        {
          op: "inc",
          metric: "experiment/runs-total",
          labels: { experiment: "my-exp" },
          amount: 1,
        },
        {
          op: "inc",
          metric: "metabase-frontend/analytics-events-dropped",
          labels: null,
          amount: 3,
        },
      ],
    });
  });

  it("is reachable under the module name the CLJS reporter requires", () => {
    const reporterModule: unknown = jest.requireActual(REPORTER_MODULE_NAME);

    expect(reporterModule).toHaveProperty(
      "postInternalAnalytics",
      expect.any(Function),
    );
  });
});
