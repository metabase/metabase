import { reconcileMetrics } from "../reconcile-metrics";
import type { ResourceLockfile } from "../types";

import { makeApp, setupResourceSyncTests } from "./setup";

const HASH = `v1:sha256:${"0".repeat(64)}`;

describe("metric reconciliation", () => {
  setupResourceSyncTests();

  it("does not update an unchanged metric copy", async () => {
    const client = {
      getCard: jest.fn().mockResolvedValue({
        id: 404,
        name: "Lifetime value",
        type: "metric",
        collection_id: 35,
        dataset_query: { database: 1, stages: [] },
        display: "table",
        visualization_settings: {},
        description: null,
      }),
      updateMetric: jest.fn(),
      createMetric: jest.fn(),
    };
    const lockfile: ResourceLockfile = {
      queries: [],
      models: [],
      metrics: [{ sourceMetricId: 251, copiedMetricId: 404, hash: HASH }],
    };
    const log = jest.fn();

    await reconcileMetrics({
      appRoot: makeApp(),
      collectionId: 35,
      resolvedQueries: [
        {
          dataset_query: { aggregation: [["metric", {}, 251]] },
          metrics: [
            {
              id: 251,
              name: "Lifetime value",
              type: "metric",
              collection_id: 1,
              dataset_query: {
                database: 1,
                "lib/metadata": null,
                stages: [],
              },
              display: "table",
              visualization_settings: {},
              description: null,
            },
          ],
        },
      ],
      lockfile,
      client,
      log,
    });

    expect(client.updateMetric).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("unchanged metric: card 251 -> card 404");
  });
});
