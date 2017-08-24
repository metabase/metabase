import {
    login,
    createTestStore
} from "__support__/integrated_tests";

import { mount } from "enzyme";
import { SegmentApi } from "metabase/services";

import { delay } from "metabase/lib/promise";
import { FETCH_SEGMENT_XRAY, FETCH_TABLE_XRAY } from "metabase/xray/xray";
import TableXRay from "metabase/xray/containers/TableXRay";
import CostSelect from "metabase/xray/components/CostSelect";
import Constituent from "metabase/xray/components/Constituent";
import SegmentXRay from "metabase/xray/containers/SegmentXRay";

describe("xray integration tests", () => {
    beforeAll(async () => {
        await login()
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
        let segmentId = null;

        beforeAll(async () => {
            const segmentDef = {name: "A Segment", description: "For testing xrays", table_id: 1, show_in_getting_started: true,
                definition: {database: 1, source_table: 1, query: {filter: ["time-interval", ["field-id", 1], -30, "day"]}}}
            segmentId = (await SegmentApi.create(segmentDef)).id;

        })

        afterAll(async () => {
            await SegmentApi.delete({ segmentId, revision_message: "Sadly this segment didn't enjoy a long life either" })
        })

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

    afterAll(async () => {
        await delay(200)
    })
});