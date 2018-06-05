import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";

import React from "react";
import { mount } from "enzyme";

import { CardApi, SegmentApi } from "metabase/services";

import {
  FETCH_SEGMENTS,
  FETCH_SEGMENT_TABLE,
  FETCH_SEGMENT_FIELDS,
  FETCH_SEGMENT_REVISIONS,
} from "metabase/redux/metadata";

import Questions from "metabase/entities/questions";

import SegmentListContainer from "metabase/reference/segments/SegmentListContainer";
import SegmentDetailContainer from "metabase/reference/segments/SegmentDetailContainer";
import SegmentQuestionsContainer from "metabase/reference/segments/SegmentQuestionsContainer";
import SegmentRevisionsContainer from "metabase/reference/segments/SegmentRevisionsContainer";
import SegmentFieldListContainer from "metabase/reference/segments/SegmentFieldListContainer";
import SegmentFieldDetailContainer from "metabase/reference/segments/SegmentFieldDetailContainer";

describe("The Reference Section", () => {
  // Test data
  const segmentDef = {
    name: "A Segment",
    description: "I did it!",
    table_id: 1,
    show_in_getting_started: true,
    definition: {
      source_table: 1,
      filter: ["time-interval", ["field-id", 1], -30, "day"],
    },
  };

  const anotherSegmentDef = {
    name: "Another Segment",
    description: "I did it again!",
    table_id: 1,
    show_in_getting_started: true,
    definition: {
      source_table: 1,
      filter: ["time-interval", ["field-id", 1], -15, "day"],
    },
  };

  const segmentCardDef = {
    name: "A card",
    display: "scalar",
    dataset_query: {
      database: 1,
      table_id: 1,
      type: "query",
      query: {
        source_table: 1,
        aggregation: ["count"],
        filter: ["segment", 1],
      },
    },
    visualization_settings: {},
  };

  // Scaffolding
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("The Segments section of the Data Reference", async () => {
    describe("Empty State", async () => {
      it("Should show no segments in the list", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/segments");
        mount(store.connectContainer(<SegmentListContainer />));
        await store.waitForActions([FETCH_SEGMENTS]);
      });
    });

    describe("With Segments State", async () => {
      let segmentIds = [];

      beforeAll(async () => {
        // Create some segments to have something to look at
        let segment = await SegmentApi.create(segmentDef);
        let anotherSegment = await SegmentApi.create(anotherSegmentDef);
        segmentIds.push(segment.id);
        segmentIds.push(anotherSegment.id);
      });

      afterAll(async () => {
        // Delete the guide we created
        // remove the metrics  we created
        // This is a bit messy as technically these are just archived
        for (const id of segmentIds) {
          await SegmentApi.delete({
            segmentId: id,
            revision_message: "Please",
          });
        }
      });

      // segments list
      it("Should show the segments in the list", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/segments");
        mount(store.connectContainer(<SegmentListContainer />));
        await store.waitForActions([FETCH_SEGMENTS]);
      });
      // segment detail
      it("Should show the segment detail view for a specific id", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/segments/" + segmentIds[0]);
        mount(store.connectContainer(<SegmentDetailContainer />));
        await store.waitForActions([FETCH_SEGMENT_TABLE]);
      });

      // segments field list
      it("Should show the segment fields list", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/segments/" + segmentIds[0] + "/fields");
        mount(store.connectContainer(<SegmentFieldListContainer />));
        await store.waitForActions([FETCH_SEGMENT_TABLE, FETCH_SEGMENT_FIELDS]);
      });
      // segment detail
      it("Should show the segment field detail view for a specific id", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/segments/" + segmentIds[0] + "/fields/" + 1);
        mount(store.connectContainer(<SegmentFieldDetailContainer />));
        await store.waitForActions([FETCH_SEGMENT_TABLE, FETCH_SEGMENT_FIELDS]);
      });

      // segment questions
      it("Should show no questions based on a new segment", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/segments/" + segmentIds[0] + "/questions");
        mount(store.connectContainer(<SegmentQuestionsContainer />));
        await store.waitForActions([
          FETCH_SEGMENT_TABLE,
          Questions.actions.fetchList,
        ]);
      });
      // segment revisions
      it("Should show revisions", async () => {
        const store = await createTestStore();
        store.pushPath("/reference/segments/" + segmentIds[0] + "/revisions");
        mount(store.connectContainer(<SegmentRevisionsContainer />));
        await store.waitForActions([
          FETCH_SEGMENT_TABLE,
          FETCH_SEGMENT_REVISIONS,
        ]);
      });

      it("Should see a newly asked question in its questions list", async () => {
        let card = await CardApi.create(segmentCardDef);

        expect(card.name).toBe(segmentCardDef.name);

        await CardApi.delete({ cardId: card.id });

        const store = await createTestStore();
        store.pushPath("/reference/segments/" + segmentIds[0] + "/questions");
        mount(store.connectContainer(<SegmentQuestionsContainer />));
        await store.waitForActions([
          FETCH_SEGMENT_TABLE,
          Questions.actions.fetchList,
        ]);
      });
    });
  });
});
