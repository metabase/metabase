import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";

import React from "react";
import { mount } from "enzyme";

import { SegmentApi, MetricApi } from "metabase/services";

import {
  FETCH_DATABASE_METADATA,
  FETCH_METRICS,
  FETCH_SEGMENTS,
} from "metabase/redux/metadata";

import GettingStartedGuideContainer from "metabase/reference/guide/GettingStartedGuideContainer";

describe("The Reference Section", () => {
  // Test data
  const segmentDef = {
    name: "A Segment",
    description: "I did it!",
    table_id: 1,
    show_in_getting_started: true,
    definition: {
      "source-table": 1,
      filter: ["time-interval", ["field-id", 1], -30, "day"],
    },
  };

  const anotherSegmentDef = {
    name: "Another Segment",
    description: "I did it again!",
    table_id: 1,
    show_in_getting_started: true,
    definition: {
      "source-table": 1,
      filter: ["time-interval", ["field-id", 1], -30, "day"],
    },
  };
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

  // Scaffolding
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("The Getting Started Guide", async () => {
    it("Should show an empty guide for non-admin users", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/");
      mount(store.connectContainer(<GettingStartedGuideContainer />));
      await store.waitForActions([
        FETCH_DATABASE_METADATA,
        FETCH_SEGMENTS,
        FETCH_METRICS,
      ]);
    });

    xit("Should show an empty guide with a creation CTA for admin users", async () => {});

    xit("A non-admin attempting to edit the guide should get an error", async () => {});

    it("Adding metrics should to the guide should make them appear", async () => {
      expect(0).toBe(0);
      let metric = await MetricApi.create(metricDef);
      expect(1).toBe(1);
      let metric2 = await MetricApi.create(anotherMetricDef);
      expect(2).toBe(2);
      await MetricApi.delete({
        metricId: metric.id,
        revision_message: "Please",
      });
      expect(1).toBe(1);
      await MetricApi.delete({
        metricId: metric2.id,
        revision_message: "Please",
      });
      expect(0).toBe(0);
    });

    it("Adding segments should to the guide should make them appear", async () => {
      expect(0).toBe(0);
      let segment = await SegmentApi.create(segmentDef);
      expect(1).toBe(1);
      let anotherSegment = await SegmentApi.create(anotherSegmentDef);
      expect(2).toBe(2);
      await SegmentApi.delete({
        segmentId: segment.id,
        revision_message: "Please",
      });
      expect(1).toBe(1);
      await SegmentApi.delete({
        segmentId: anotherSegment.id,
        revision_message: "Please",
      });
      expect(0).toBe(0);
    });
  });
});
