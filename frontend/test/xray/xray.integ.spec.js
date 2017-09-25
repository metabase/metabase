import {
    login,
    createTestStore,
    createSavedQuestion
} from "__support__/integrated_tests";
import {
    click
} from "__support__/enzyme_utils"

import { mount } from "enzyme";
import {
    CardApi,
    SegmentApi,
    SettingsApi
} from "metabase/services";

import { delay } from "metabase/lib/promise";
import { FETCH_XRAY, LOAD_XRAY } from "metabase/xray/xray";

import FieldXray from "metabase/xray/containers/FieldXray";
import TableXRay from "metabase/xray/containers/TableXRay";
import SegmentXRay from "metabase/xray/containers/SegmentXRay";
import CardXRay from "metabase/xray/containers/CardXRay";

import CostSelect from "metabase/xray/components/CostSelect";
import Constituent from "metabase/xray/components/Constituent";

import Question from "metabase-lib/lib/Question";
import * as Urls from "metabase/lib/urls";
import { INITIALIZE_QB, QUERY_COMPLETED } from "metabase/query_builder/actions";
import ActionsWidget from "metabase/query_builder/components/ActionsWidget";

// settings related actions for testing xray administration
import { INITIALIZE_SETTINGS, UPDATE_SETTING } from "metabase/admin/settings/settings";
import { LOAD_CURRENT_USER } from "metabase/redux/user";
import { END_LOADING } from "metabase/reference/reference";

import { getXrayEnabled, getMaxCost } from "metabase/xray/selectors";

import Icon from "metabase/components/Icon"
import Toggle from "metabase/components/Toggle"
import { Link } from 'react-router'
import SettingsXrayForm from "metabase/admin/settings/components/SettingsXrayForm";

describe("xray integration tests", () => {
    let segmentId = null;
    let timeBreakoutQuestion = null;
    let segmentQuestion = null;

    beforeAll(async () => {
        await login()

        const segmentDef = {name: "A Segment", description: "For testing xrays", table_id: 1, show_in_getting_started: true,
            definition: { source_table: 1, filter: ["time-interval", ["field-id", 1], -30, "day"] }}
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
        await SettingsApi.put({ key: 'enable-xrays' }, true)
    })

    describe("table x-rays", async () => {
        it("should render the table x-ray page without errors", async () => {
            const store = await createTestStore()
            store.pushPath(`/xray/table/1/approximate`);

            const app = mount(store.getAppContainer());
            await store.waitForActions([FETCH_XRAY, LOAD_XRAY], { timeout: 20000 })

            const tableXRay = app.find(TableXRay)
            expect(tableXRay.length).toBe(1)
            expect(tableXRay.find(CostSelect).length).toBe(1)
            expect(tableXRay.find(Constituent).length).toBeGreaterThan(0)
            expect(tableXRay.text()).toMatch(/Orders/);
        })
    })

    describe("field x-rays", async () => {
        it("should render the field x-ray page without errors", async () => {
            const store = await createTestStore()
            store.pushPath(`/xray/field/1/approximate`);

            const app = mount(store.getAppContainer());
            await store.waitForActions([FETCH_XRAY, LOAD_XRAY], { timeout: 20000 })

            const fieldXRay = app.find(FieldXray)
            expect(fieldXRay.length).toBe(1)
            expect(fieldXRay.find(CostSelect).length).toBe(1)

        })
    })

    describe("navigation", async () => {
        it("should be possible to navigate between tables and their child fields", async () => {
            const store = await createTestStore()
            store.pushPath(`/xray/table/1/approximate`);

            const app = mount(store.getAppContainer());
            await store.waitForActions([FETCH_XRAY, LOAD_XRAY], { timeout: 20000 })

            const tableXray = app.find(TableXRay)
            expect(tableXray.length).toBe(1)

            const fieldLink = app.find(Constituent).first().find(Link)

            click(fieldLink)

            await store.waitForActions([FETCH_XRAY, LOAD_XRAY], { timeout: 20000 })
            const fieldXray = app.find(FieldXray)
            expect(fieldXray.length).toBe(1)

        })
    })

    // NOTE Atte Keinänen 8/24/17: I wanted to test both QB action widget xray action and the card/segment xray pages
    // in the same tests so that we see that end-to-end user experience matches our expectations

    describe("query builder actions", async () => {
        beforeEach(async () => {
            await SettingsApi.put({ key: 'enable-xrays', value: 'true' })
        })

        it("let you see card xray for a timeseries question", async () => {
            await SettingsApi.put({ key: 'xray-max-cost', value: 'extended' })
            const store = await createTestStore()
            // make sure xrays are on and at the proper cost
            store.pushPath(Urls.question(timeBreakoutQuestion.id()))
            const app = mount(store.getAppContainer());

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED])
            // NOTE Atte Keinänen: Not sure why we need this delay to get most of action widget actions to appear :/
            await delay(500);

            const actionsWidget = app.find(ActionsWidget)
            click(actionsWidget.childAt(0))
            const xrayOptionIcon = actionsWidget.find('.Icon.Icon-beaker')
            click(xrayOptionIcon);


            await store.waitForActions([FETCH_XRAY, LOAD_XRAY], {timeout: 5000})
            expect(store.getPath()).toBe(`/xray/card/${timeBreakoutQuestion.id()}/extended`)

            const cardXRay = app.find(CardXRay)
            expect(cardXRay.length).toBe(1)
            expect(cardXRay.text()).toMatch(/Time breakout question/);
        })

        it("let you see segment xray for a question containing a segment", async () => {
            const store = await createTestStore()
            store.pushPath(Urls.question(segmentQuestion.id()))
            const app = mount(store.getAppContainer());

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED])

            const actionsWidget = app.find(ActionsWidget)
            click(actionsWidget.childAt(0))
            const xrayOptionIcon = actionsWidget.find('.Icon.Icon-beaker')
            click(xrayOptionIcon);

            await store.waitForActions([FETCH_XRAY, LOAD_XRAY], { timeout: 5000 })
            expect(store.getPath()).toBe(`/xray/segment/${segmentId}/approximate`)

            const segmentXRay = app.find(SegmentXRay)
            expect(segmentXRay.length).toBe(1)
            expect(segmentXRay.find(CostSelect).length).toBe(1)
            expect(segmentXRay.text()).toMatch(/A Segment/);
        })
    })

    describe("admin management of xrays", async () => {
        it("should allow an admin to manage xrays", async () => {
            let app;

            const store = await createTestStore()

            store.pushPath('/admin/settings/x_rays')

            app = mount(store.getAppContainer())

            await store.waitForActions([LOAD_CURRENT_USER, INITIALIZE_SETTINGS])

            const xraySettings = app.find(SettingsXrayForm)
            const xrayToggle = xraySettings.find(Toggle)

            // there should be a toggle
            expect(xrayToggle.length).toEqual(1)

            // things should be on
            expect(getXrayEnabled(store.getState())).toEqual(true)
            // the toggle should be on by default
            expect(xrayToggle.props().value).toEqual(true)

            // toggle the... toggle
            click(xrayToggle)
            await store.waitForActions([UPDATE_SETTING])

            expect(getXrayEnabled(store.getState())).toEqual(false)

            // navigate to a previosuly x-ray-able entity
            store.pushPath(Urls.question(timeBreakoutQuestion.id()))
            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED])

            // for some reason a delay is needed to get the full action suite
            await delay(500);

            const actionsWidget = app.find(ActionsWidget)
            click(actionsWidget.childAt(0))

            // there should not be an xray option
            const xrayOptionIcon = actionsWidget.find('.Icon.Icon-beaker')
            expect(xrayOptionIcon.length).toEqual(0)
        })

        it("should not show xray options for segments when xrays are disabled", async () => {
            // turn off xrays
            await SettingsApi.put({ key: 'enable-xrays', value: false })

            const store = await createTestStore()

            store.pushPath(Urls.question(segmentQuestion.id()))
            const app = mount(store.getAppContainer())

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED])
            await delay(500);

            const actionsWidget = app.find(ActionsWidget)
            click(actionsWidget.childAt(0))
            const xrayOptionIcon = actionsWidget.find('.Icon.Icon-beaker')
            expect(xrayOptionIcon.length).toEqual(0)
        })

        it("should properly reflect the an admin set the max cost of xrays", async () => {
            await SettingsApi.put({ key: 'enable-xrays', value: true })
            const store = await createTestStore()

            store.pushPath('/admin/settings/x_rays')

            const app = mount(store.getAppContainer())

            await store.waitForActions([LOAD_CURRENT_USER, INITIALIZE_SETTINGS])

            const xraySettings = app.find(SettingsXrayForm)

            expect(xraySettings.find(Icon).length).toEqual(3)

            const approximate = xraySettings.find('.text-measure li').first()

            click(approximate)
            await store.waitForActions([UPDATE_SETTING])

            expect(approximate.hasClass('text-brand')).toEqual(true)
            expect(getMaxCost(store.getState())).toEqual('approximate')

            store.pushPath(`/xray/table/1/approximate`);

            await store.waitForActions(FETCH_XRAY, { timeout: 20000 })
            await delay(200)

            const tableXRay = app.find(TableXRay)
            expect(tableXRay.length).toBe(1)
            expect(tableXRay.find(CostSelect).length).toBe(1)
            // there should be two disabled states
            expect(tableXRay.find('a.disabled').length).toEqual(2)
        })

    })
    describe("data reference entry", async () => {
        it("should be possible to access an Xray from the data reference", async () => {
            // ensure xrays are on
            await SettingsApi.put({ key: 'enable-xrays', value: true })
            const store = await createTestStore()

            store.pushPath('/reference/databases/1/tables/1')

            const app = mount(store.getAppContainer())

            await store.waitForActions([END_LOADING])

            const xrayTableSideBarItem = app.find('.Icon.Icon-beaker')
            expect(xrayTableSideBarItem.length).toEqual(1)

            store.pushPath('/reference/databases/1/tables/1/fields/1')

            await store.waitForActions([END_LOADING])
            const xrayFieldSideBarItem = app.find('.Icon.Icon-beaker')
            expect(xrayFieldSideBarItem.length).toEqual(1)
        })

        it("should not be possible to access an Xray from the data reference if xrays are disabled", async () => {
            // turn off xrays
            await SettingsApi.put({ key: 'enable-xrays', value: false })
            const store = await createTestStore()

            const app = mount(store.getAppContainer())

            store.pushPath('/reference/databases/1/tables/1')

            await store.waitForActions([END_LOADING])

            const xrayTableSideBarItem = app.find('.Icon.Icon-beaker')
            expect(xrayTableSideBarItem.length).toEqual(0)

            store.pushPath('/reference/databases/1/tables/1/fields/1')
            await store.waitForActions([END_LOADING])
            const xrayFieldSideBarItem = app.find('.Icon.Icon-beaker')
            expect(xrayFieldSideBarItem.length).toEqual(0)
        })
    })

    afterAll(async () => {
        await delay(2000)
    })
});
