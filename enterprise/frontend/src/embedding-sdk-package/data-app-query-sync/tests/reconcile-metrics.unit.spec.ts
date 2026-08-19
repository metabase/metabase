import {
  reconcileMetrics,
  reconcileRemovedMetrics,
} from "../reconcile-metrics";
import type { DataAppMetric, ResourceLockfile } from "../types";

import { makeApp, setupResourceSyncTests } from "./setup";

const HASH = `v1:sha256:${"0".repeat(64)}`;

describe("metric reconciliation", () => {
  setupResourceSyncTests();

  it("does not update an unchanged copied metric", async () => {
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
      deleteCard: jest.fn(),
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
    expect(log).toHaveBeenCalledWith("unchanged metric: 251 -> 404");
  });

  it("copies a missing metric and rewrites metric references", async () => {
    const client = {
      getCard: jest.fn(),
      updateMetric: jest.fn(),
      createMetric: jest.fn().mockResolvedValue({ id: 404 }),
      deleteCard: jest.fn(),
    };

    const lockfile: ResourceLockfile = {
      queries: [],
      models: [],
      metrics: [],
    };

    const metric: DataAppMetric = {
      id: 251,
      name: "Lifetime value",
      type: "metric",
      collection_id: 1,
      dataset_query: { database: 1, stages: [] },
      display: "table",
      visualization_settings: {},
      description: null,
    };

    const resolvedQuery = {
      dataset_query: {
        stages: [{ aggregation: [["metric", {}, 251]] }],
      },
      metrics: [metric],
    };

    await reconcileMetrics({
      appRoot: makeApp(),
      collectionId: 35,
      resolvedQueries: [resolvedQuery],
      lockfile,
      client,
      log: jest.fn(),
    });

    expect(client.createMetric).toHaveBeenCalledWith({
      name: "Lifetime value",
      collectionId: 35,
      datasetQuery: { database: 1, stages: [] },
      display: "table",
      visualizationSettings: {},
      description: null,
    });

    expect(lockfile.metrics).toEqual([
      { sourceMetricId: 251, copiedMetricId: 404, hash: expect.any(String) },
    ]);

    expect(resolvedQuery.dataset_query).toEqual({
      stages: [{ aggregation: [["metric", {}, 404]] }],
    });
  });

  it("fails before copying metrics when a resolved query omits a metric", async () => {
    const client = {
      getCard: jest.fn(),
      updateMetric: jest.fn(),
      createMetric: jest.fn(),
      deleteCard: jest.fn(),
    };

    await expect(
      reconcileMetrics({
        appRoot: makeApp(),
        collectionId: 35,
        resolvedQueries: [
          {
            dataset_query: {
              stages: [{ aggregation: [["metric", {}, 251]] }],
            },
            metrics: [],
          },
        ],
        lockfile: { queries: [], models: [], metrics: [] },
        client,
        log: jest.fn(),
      }),
    ).rejects.toThrow(
      "These metrics are missing and cannot be reconciled: 251.",
    );

    expect(client.createMetric).not.toHaveBeenCalled();
    expect(client.updateMetric).not.toHaveBeenCalled();
  });

  it("deletes a copied metric when no query references it", async () => {
    const appRoot = makeApp();

    const client = {
      getCard: jest.fn().mockResolvedValue({
        id: 404,
        name: "Lifetime value",
        type: "metric",
        collection_id: 35,
        dataset_query: { database: 1, stages: [] },
      }),
      updateMetric: jest.fn(),
      createMetric: jest.fn(),
      deleteCard: jest.fn(),
    };

    const lockfile: ResourceLockfile = {
      queries: [],
      models: [],
      metrics: [{ sourceMetricId: 251, copiedMetricId: 404, hash: HASH }],
    };

    const log = jest.fn();

    const metricReconciliation = await reconcileMetrics({
      appRoot,
      collectionId: 35,
      resolvedQueries: [],
      lockfile,
      client,
      log,
    });

    expect(client.deleteCard).not.toHaveBeenCalled();

    await reconcileRemovedMetrics({
      appRoot,
      collectionId: 35,
      ...metricReconciliation,
      lockfile,
      client,
      log,
    });

    expect(client.deleteCard).toHaveBeenCalledWith(404);
    expect(lockfile.metrics).toEqual([]);
    expect(log).toHaveBeenCalledWith("deleted metric: 404");
  });
});
