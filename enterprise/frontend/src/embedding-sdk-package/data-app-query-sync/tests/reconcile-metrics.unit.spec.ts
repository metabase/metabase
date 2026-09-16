import { MetabaseApiError, MetabaseClient } from "../metabase-client";
import {
  reconcileMetrics,
  reconcileRemovedMetrics,
} from "../reconcile-metrics";
import type { DataAppMetric, ResourceLockfile } from "../types";

import { jsonResponse, makeApp, setupResourceSyncTests } from "./setup";

const HASH = `v1:sha256:${"0".repeat(64)}`;

const createMockClient = () => ({
  getCard: jest.fn(),
  updateMetric: jest.fn(),
  createMetric: jest.fn(),
  deleteCard: jest.fn(),
});

describe("metric reconciliation", () => {
  setupResourceSyncTests();

  it("does not update an unchanged copied metric", async () => {
    const client = createMockClient();

    client.getCard.mockResolvedValue({
      id: 404,
      name: "Lifetime value",
      type: "metric",
      collection_id: 35,
      dataset_query: { database: 1, stages: [] },
      display: "table",
      visualization_settings: {},
      description: null,
    });

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
    const client = createMockClient();
    client.createMetric.mockResolvedValue({ id: 404 });

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

  it("updates a changed copied metric", async () => {
    const client = createMockClient();

    client.getCard.mockResolvedValue({
      id: 404,
      name: "Old metric name",
      type: "metric",
      collection_id: 35,
      dataset_query: { database: 1, stages: [] },
      display: "table",
      visualization_settings: {},
      description: null,
    });

    const lockfile: ResourceLockfile = {
      queries: [],
      models: [],
      metrics: [{ sourceMetricId: 251, copiedMetricId: 404, hash: HASH }],
    };

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
              dataset_query: { database: 1, stages: [] },
              display: "table",
              visualization_settings: {},
              description: null,
            },
          ],
        },
      ],
      lockfile,
      client,
      log: jest.fn(),
    });

    expect(client.updateMetric).toHaveBeenCalledWith(404, {
      name: "Lifetime value",
      collectionId: 35,
      datasetQuery: { database: 1, stages: [] },
      display: "table",
      visualizationSettings: {},
      description: null,
    });
  });

  it("replaces a missing copied metric and rewrites its references", async () => {
    const client = createMockClient();

    client.getCard.mockRejectedValue(
      new MetabaseApiError(404, "Metric not found"),
    );

    client.createMetric.mockResolvedValue({ id: 405 });

    const lockfile: ResourceLockfile = {
      queries: [],
      models: [],
      metrics: [{ sourceMetricId: 251, copiedMetricId: 404, hash: HASH }],
    };

    const resolvedQuery = {
      dataset_query: { stages: [{ aggregation: [["metric", {}, 251]] }] },
      metrics: [
        {
          id: 251,
          name: "Lifetime value",
          type: "metric" as const,
          collection_id: 1,
          dataset_query: { database: 1, stages: [] },
          display: "table",
          visualization_settings: {},
          description: null,
        },
      ],
    };

    await reconcileMetrics({
      appRoot: makeApp(),
      collectionId: 35,
      resolvedQueries: [resolvedQuery],
      lockfile,
      client,
      log: jest.fn(),
    });

    expect(client.createMetric).toHaveBeenCalledTimes(1);

    expect(lockfile.metrics).toEqual([
      { sourceMetricId: 251, copiedMetricId: 405, hash: expect.any(String) },
    ]);

    expect(resolvedQuery.dataset_query).toEqual({
      stages: [{ aggregation: [["metric", {}, 405]] }],
    });
  });

  it("fails before copying metrics when a resolved query omits a metric", async () => {
    const client = createMockClient();

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

  it("rejects a metric that joins a saved card", async () => {
    const client = createMockClient();

    await expect(
      reconcileMetrics({
        appRoot: makeApp(),
        collectionId: 35,
        resolvedQueries: [
          {
            dataset_query: {
              stages: [{ aggregation: [["metric", {}, 251]] }],
            },
            metrics: [
              {
                id: 251,
                name: "Lifetime value",
                type: "metric",
                collection_id: 1,
                dataset_query: {
                  stages: [
                    {
                      "source-table": 1,
                      joins: [{ stages: [{ "source-card": 99 }] }],
                    },
                  ],
                },
                display: "table",
                visualization_settings: {},
                description: null,
              },
            ],
          },
        ],
        lockfile: { queries: [], models: [], metrics: [] },
        client,
        log: jest.fn(),
      }),
    ).rejects.toThrow(
      "Metrics with saved-card joins cannot be synchronized: 251.",
    );

    expect(client.createMetric).not.toHaveBeenCalled();
    expect(client.updateMetric).not.toHaveBeenCalled();
  });

  it("deletes a copied metric when no query references it", async () => {
    const appRoot = makeApp();
    const client = createMockClient();

    client.getCard.mockResolvedValue({
      id: 404,
      name: "Lifetime value",
      type: "metric",
      collection_id: 35,
      dataset_query: { database: 1, stages: [] },
    });

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

  describe("archived and moved copies", () => {
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

    let appRoot: string;
    let lockfile: ResourceLockfile;

    beforeEach(() => {
      appRoot = makeApp();

      lockfile = {
        queries: [],
        models: [],
        metrics: [{ sourceMetricId: 251, copiedMetricId: 404, hash: HASH }],
      };
    });

    it("sends the restore payload for an unchanged archived metric", async () => {
      const copy = {
        ...metric,
        id: 404,
        collection_id: 99,
        archived: true,
      };

      const fetchMock = jest
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(jsonResponse(copy))
        .mockResolvedValueOnce(jsonResponse({ ...copy, archived: false }));

      const resolvedQuery = {
        dataset_query: { aggregation: [["metric", {}, 251]] },
        metrics: [metric],
      };

      await reconcileMetrics({
        appRoot,
        collectionId: 35,
        resolvedQueries: [resolvedQuery],
        lockfile,
        client: new MetabaseClient("http://metabase.test", "secret"),
        log: jest.fn(),
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);

      expect(fetchMock).toHaveBeenLastCalledWith(
        new URL("http://metabase.test/api/card/404"),
        expect.objectContaining({
          method: "PUT",
          body: expect.any(String),
        }),
      );

      expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
        name: "Lifetime value",
        type: "metric",
        archived: false,
        collection_id: 35,
        dataset_query: metric.dataset_query,
        display: "table",
        visualization_settings: {},
        description: null,
      });
    });

    describe("unarchived copies moved outside the app collection", () => {
      let client: ReturnType<typeof createMockClient>;

      beforeEach(() => {
        client = createMockClient();

        client.getCard.mockResolvedValue({
          ...metric,
          id: 404,
          collection_id: 99,
          archived: false,
        });
      });

      it("does not update a metric copy that is moved to other collection", async () => {
        await expect(
          reconcileMetrics({
            appRoot,
            collectionId: 35,
            lockfile,
            client,
            log: jest.fn(),
            resolvedQueries: [{ dataset_query: {}, metrics: [metric] }],
          }),
        ).rejects.toThrow(/data app collection 35/);

        expect(client.updateMetric).not.toHaveBeenCalled();
        expect(client.createMetric).not.toHaveBeenCalled();
        expect(client.deleteCard).not.toHaveBeenCalled();

        expect(lockfile.metrics).toEqual([
          { sourceMetricId: 251, copiedMetricId: 404, hash: HASH },
        ]);
      });

      it("does not delete a metric copy that is moved to other collection when its source is removed", async () => {
        await expect(
          reconcileRemovedMetrics({
            appRoot,
            collectionId: 35,
            lockfile,
            client,
            log: jest.fn(),
            previousEntries: [...lockfile.metrics],
            liveMetricIds: new Set(),
          }),
        ).rejects.toThrow(/data app collection 35/);

        expect(client.updateMetric).not.toHaveBeenCalled();
        expect(client.createMetric).not.toHaveBeenCalled();
        expect(client.deleteCard).not.toHaveBeenCalled();

        expect(lockfile.metrics).toEqual([
          { sourceMetricId: 251, copiedMetricId: 404, hash: HASH },
        ]);
      });
    });
  });
});
