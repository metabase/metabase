import {
    login,
    createTestStore,
    createSavedQuestion
} from "__support__/integrated_tests";
import {
    click
} from "__support__/enzyme_utils"

import { mount } from "enzyme";
import { CardApi, SegmentApi } from "metabase/services";

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
    let timeBreakoutQuestion = null;
    let segmentQuestion = null;

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
        await CardApi.delete({cardId: timeBreakoutQuestion.id()})
        await CardApi.delete({cardId: segmentQuestion.id()})
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

    // NOTE Atte Keinänen 8/24/17: I wanted to test both QB action widget xray action and the card/segment xray pages
    // in the same tests so that we see that end-to-end user experience matches our expectations

    describe("query builder actions", async () => {
        it("let you see card xray for a timeseries question", async () => {
            const store = await createTestStore()
            store.pushPath(Urls.question(timeBreakoutQuestion.id()))
            const app = mount(store.getAppContainer());

            await store.waitForActions(INITIALIZE_QB, QUERY_COMPLETED)
            // NOTE Atte Keinänen: Not sure why we need this delay to get most of action widget actions to appear :/
            await delay(500);

            const actionsWidget = app.find(ActionsWidget)
            click(actionsWidget.childAt(0))
            const xrayOptionIcon = actionsWidget.find('.Icon.Icon-beaker')
            click(xrayOptionIcon);


            await store.waitForActions(FETCH_CARD_XRAY, {timeout: 5000})
            expect(store.getPath()).toBe(`/xray/card/${timeBreakoutQuestion.id()}/extended`)

            const cardXRay = app.find(CardXRay)
            expect(cardXRay.length).toBe(1)
            expect(cardXRay.text()).toMatch(/Time breakout question/);
        })

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