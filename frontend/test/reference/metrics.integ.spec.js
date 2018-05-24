import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";

import React from "react";
import { mount } from "enzyme";

import { CardApi, MetricApi } from "metabase/services";

import {
  FETCH_METRICS,
  FETCH_METRIC_TABLE,
  FETCH_METRIC_REVISIONS,
} from "metabase/redux/metadata";

import { FETCH_GUIDE } from "metabase/reference/reference";

import MetricListContainer from "metabase/reference/metrics/MetricListContainer";
import MetricDetailContainer from "metabase/reference/metrics/MetricDetailContainer";
import MetricQuestionsContainer from "metabase/reference/metrics/MetricQuestionsContainer";
import MetricRevisionsContainer from "metabase/reference/metrics/MetricRevisionsContainer";

describe("The Reference Section", () => {
  // Test data
  const metricDef = {
    name: "A Metric",
    description: "I did it!",
    table_id: 1,
    show_in_getting_started: true,
    definition: { database: 1, query: { aggregation: ["count"] } },
  };

  const anotherMetricDef = {
    name: "Another Metric",
    description: "I did it again!",
    table_id: 1,
    show_in_getting_started: true,
    definition: { database: 1, query: { aggregation: ["count"] } },
  };

  const metricCardDef = {
    name: "A card",
    display: "scalar",
    dataset_query: {
      database: 1,
      table_id: 1,
      type: "query",
      query: { source_table: 1, aggregation: ["metric", 1] },
    },
    visualization_settings: {},
  };

  // Scaffolding
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("The Metrics section of the Data Reference", async () => {
    describe("Empty State", async () => {
      it("Should show no metrics in the list", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/metrics");
        mount(store.connectContainer(<MetricListContainer />));
        await store.waitForActions([FETCH_METRICS]);
      });
    });

    describe("With Metrics State", async () => {
      let metricIds = [];

      beforeAll(async () => {
        // Create some metrics to have something to look at
        let metric = await MetricApi.create(metricDef);
        let metric2 = await MetricApi.create(anotherMetricDef);

        metricIds.push(metric.id);
        metricIds.push(metric2.id);
      });

      afterAll(async () => {
        // Delete the guide we created
        // remove the metrics we created
        // This is a bit messy as technically these are just archived
        for (const id of metricIds) {
          await MetricApi.delete({ metricId: id, revision_message: "Please" });
        }
      });
      // metrics list
      it("Should show no metrics in the list", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/metrics");
        mount(store.connectContainer(<MetricListContainer />));
        await store.waitForActions([FETCH_METRICS]);
      });
      // metric detail
      it("Should show the metric detail view for a specific id", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/metrics/" + metricIds[0]);
        mount(store.connectContainer(<MetricDetailContainer />));
        await store.waitForActions([FETCH_METRIC_TABLE, FETCH_GUIDE]);
      });
      // metrics questions
      it("Should show no questions based on a new metric", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/metrics/" + metricIds[0] + "/questions");
        mount(store.connectContainer(<MetricQuestionsContainer />));
        await store.waitForActions([FETCH_METRICS, FETCH_METRIC_TABLE]);
      });
      // metrics revisions
      it("Should show revisions", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/metrics/" + metricIds[0] + "/revisions");
        mount(store.connectContainer(<MetricRevisionsContainer />));
        await store.waitForActions([FETCH_METRICS, FETCH_METRIC_REVISIONS]);
      });

      it("Should see a newly asked question in its questions list", async () => {
        let card = await CardApi.create(metricCardDef);
        expect(card.name).toBe(metricCardDef.name);

        try {
          // see that there is a new question on the metric's questions page
          const store = await createTestStore();

          store.pushPath("/reference/metrics/" + metricIds[0] + "/questions");
          mount(store.connectContainer(<MetricQuestionsContainer />));
          await store.waitForActions([FETCH_METRICS, FETCH_METRIC_TABLE]);
        } finally {
          // even if the code above results in an exception, try to delete the question
          await CardApi.delete({ cardId: card.id });
        }
      });
    });
  });
});
