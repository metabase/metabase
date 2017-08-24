import {
    login,
    createTestStore,
    createSavedQuestion
} from "__support__/integrated_tests";
import {
    click
} from "__support__/enzyme_utils"

import { mount } from "enzyme";
import { SegmentApi } from "metabase/services";

import { delay } from "metabase/lib/promise";
import { FETCH_CARD_XRAY, FETCH_SEGMENT_XRAY, FETCH_TABLE_XRAY } from "metabase/xray/xray";
import TableXRay from "metabase/xray/containers/TableXRay";
import CostSelect from "metabase/xray/components/CostSelect";
import Constituent from "metabase/xray/components/Constituent";
import SegmentXRay from "metabase/xray/containers/SegmentXRay";
import Question from "metabase-lib/lib/Question";
import CardXRay from "metabase/xray/containers/CardXRay";
import * as Urls from "metabase/lib/urls";
import { INITIALIZE_QB, QUERY_COMPLETED } from "metabase/query_builder/actions";
import ActionsWidget from "metabase/query_builder/components/ActionsWidget";

describe("xray integration tests", () => {
    let segmentId = null;
    let segmentQuestion = null;
    let timeBreakoutQuestion = null;

    beforeAll(async () => {
        await login()

        const segmentDef = {name: "A Segment", description: "For testing xrays", table_id: 1, show_in_getting_started: true,
            definition: {database: 1, source_table: 1, query: {filter: ["time-interval", ["field-id", 1], -30, "day"]}}}
        segmentId = (await SegmentApi.create(segmentDef)).id;

        timeBreakoutQuestion = await createSavedQuestion(
            Question.create({databaseId: 1, tableId: 1, metadata: null})
                .query()
                .addAggregation(["count"])
                .addBreakout(["datetime-field", ["field-id", 1], "day"])
                .question()
                .setDisplay("line")
                .setDisplayName("Time breakout question")
        )

        segmentQuestion = await createSavedQuestion(
            Question.create({databaseId: 1, tableId: 1, metadata: null})
                .query()
                .addFilter(["SEGMENT", segmentId])
                .question()
                .setDisplay("line")
                .setDisplayName("Segment question")
        )
    })

    afterAll(async () => {
        await SegmentApi.delete({ segmentId, revision_message: "Sadly this segment didn't enjoy a long life either" })
    })

    describe("for table xray", async () => {
        it("should render the table xray page without errors", async () => {
            const store = await createTestStore()
            store.pushPath(`/xray/table/1/approximate`);

            const app = mount(store.getAppContainer());
            await store.waitForActions(FETCH_TABLE_XRAY, { timeout: 20000 })

            const tableXRay = app.find(TableXRay)
            expect(tableXRay.length).toBe(1)
            expect(tableXRay.find(CostSelect).length).toBe(1)
            expect(tableXRay.find(Constituent).length).toBeGreaterThan(0)
            expect(tableXRay.text()).toMatch(/Orders/);
        })
    })

    describe("for segment xray", async () => {
        it("should render the segment xray page without errors", async () => {
            const store = await createTestStore()
            store.pushPath(`/xray/segment/${segmentId}/approximate`);
            const app = mount(store.getAppContainer());

            await store.waitForActions(FETCH_SEGMENT_XRAY, { timeout: 5000 })

            const segmentXRay = app.find(SegmentXRay)
            expect(segmentXRay.length).toBe(1)
            expect(segmentXRay.find(CostSelect).length).toBe(1)
            expect(segmentXRay.text()).toMatch(/A Segment/);
        })
    })

    describe("for question xray", async () => {
        it("should let you see xray for Order, Count of Rows, Created At: Week", async () => {
            const store = await createTestStore()
            store.pushPath(`/xray/card/${timeBreakoutQuestion.id()}/extended`);
            const app = mount(store.getAppContainer());

            await store.waitForActions(FETCH_CARD_XRAY, { timeout: 5000 })

            const cardXRay = app.find(CardXRay)
            expect(cardXRay.length).toBe(1)
            expect(cardXRay.find(CostSelect).length).toBe(1)
            expect(cardXRay.text()).toMatch(/Time breakout question/);
        })
    })

    // TODO: Should this be here under xrays test suite or should it be under query builder actions test suite?
    describe("query builder actions", async () => {
        it("let you see segment xray for a question containing a segment", async () => {
            const store = await createTestStore()
            store.pushPath(Urls.question(segmentQuestion.id()))
            const app = mount(store.getAppContainer());

            await store.waitForActions(INITIALIZE_QB, QUERY_COMPLETED)

            const actionsWidget = app.find(ActionsWidget)
            click(actionsWidget.childAt(0))
            const xrayOptionIcon = actionsWidget.find('.Icon.Icon-beaker')
            click(xrayOptionIcon);

            await store.waitForActions(FETCH_SEGMENT_XRAY, { timeout: 5000 })
            expect(store.getPath()).toBe(`/xray/segment/${segmentId}/approximate`)

            const segmentXRay = app.find(SegmentXRay)
            expect(segmentXRay.length).toBe(1)
            expect(segmentXRay.find(CostSelect).length).toBe(1)
            expect(segmentXRay.text()).toMatch(/A Segment/);
        })
    })

    afterAll(async () => {
        await delay(2000)
    })
});