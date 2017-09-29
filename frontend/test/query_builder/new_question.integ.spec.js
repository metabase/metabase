import { mount } from "enzyme"

import {
    login,
    createTestStore,
} from "__support__/integrated_tests";

import EntitySearch, {
    SearchGroupingOption, SearchResultListItem,
    SearchResultsGroup
} from "metabase/containers/EntitySearch";

import AggregationWidget from "metabase/query_builder/components/AggregationWidget";

import {
    click,
} from "__support__/enzyme_utils"

import { RESET_QUERY } from "metabase/new_query/new_query";

import { getQuery } from "metabase/query_builder/selectors";
import DataSelector from "metabase/query_builder/components/DataSelector";

import {
    FETCH_METRICS,
    FETCH_SEGMENTS,
    FETCH_DATABASES
} from "metabase/redux/metadata"
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

import { delay } from 'metabase/lib/promise'
import * as Urls from "metabase/lib/urls";

import {
    INITIALIZE_QB,
    UPDATE_URL,
    REDIRECT_TO_NEW_QUESTION_FLOW, LOAD_METADATA_FOR_CARD,
    QUERY_COMPLETED,
} from "metabase/query_builder/actions";

import { MetricApi, SegmentApi } from "metabase/services";
import { SET_REQUEST_STATE } from "metabase/redux/requests";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import NewQueryOption from "metabase/new_query/components/NewQueryOption";

describe("new question flow", async () => {
    // test an instance with segments, metrics, etc as an admin
    describe("a rich instance", async () => {
        let metricId = null;
        let segmentId = null;

        beforeAll(async () => {
            await login()
            // TODO: Move these test metric/segment definitions to a central place
            const metricDef = {name: "A Metric", description: "For testing new question flow", table_id: 1,show_in_getting_started: true,
                definition: {database: 1, query: {aggregation: ["count"]}}}
            const segmentDef = {name: "A Segment", description: "For testing new question flow", table_id: 1, show_in_getting_started: true,
                definition: {database: 1, query: {filter: ["abc"]}}}

            // Needed for question creation flow
            metricId = (await MetricApi.create(metricDef)).id;
            segmentId = (await SegmentApi.create(segmentDef)).id;

        })

        afterAll(async () => {
            await MetricApi.delete({ metricId, revision_message: "The lifetime of this metric was just a few seconds" })
            await SegmentApi.delete({ segmentId, revision_message: "Sadly this segment didn't enjoy a long life either" })
        })

        it("redirects /question to /question/new", async () => {
            const store = await createTestStore()
            store.pushPath("/question");
            mount(store.getAppContainer());
            await store.waitForActions([REDIRECT_TO_NEW_QUESTION_FLOW])
            expect(store.getPath()).toBe("/question/new")
        })
        it("renders normally on page load", async () => {
            const store = await createTestStore()

            store.pushPath(Urls.newQuestion());
            const app = mount(store.getAppContainer());
            await store.waitForActions([RESET_QUERY, FETCH_METRICS, FETCH_SEGMENTS]);
            await store.waitForActions([SET_REQUEST_STATE]);

            expect(app.find(NewQueryOption).length).toBe(3)
        });
        it("lets you start a custom gui question", async () => {
            const store = await createTestStore()

            store.pushPath(Urls.newQuestion());
            const app = mount(store.getAppContainer());
            await store.waitForActions([RESET_QUERY, FETCH_METRICS, FETCH_SEGMENTS]);
            await store.waitForActions([SET_REQUEST_STATE]);

            click(app.find(NewQueryOption).filterWhere((c) => c.prop('title') === "Custom"))
            await store.waitForActions(INITIALIZE_QB, UPDATE_URL, LOAD_METADATA_FOR_CARD);
            expect(getQuery(store.getState()) instanceof StructuredQuery).toBe(true)
        })

        it("lets you start a custom native question", async () => {
            // Don't render Ace editor in tests because it uses many DOM methods that aren't supported by jsdom
            // see also parameters.integ.js for more notes about Ace editor testing
            NativeQueryEditor.prototype.loadAceEditor = () => {}

            const store = await createTestStore()

            store.pushPath(Urls.newQuestion());
            const app = mount(store.getAppContainer());
            await store.waitForActions([RESET_QUERY, FETCH_METRICS, FETCH_SEGMENTS, FETCH_DATABASES]);
            await store.waitForActions([SET_REQUEST_STATE]);

            click(app.find(NewQueryOption).filterWhere((c) => c.prop('title') === "SQL"))
            await store.waitForActions(INITIALIZE_QB);
            expect(getQuery(store.getState()) instanceof NativeQuery).toBe(true)

            // No database selector visible because in test environment we should
            // only have a single database
            expect(app.find(DataSelector).length).toBe(0)

            // The name of the database should be displayed
            expect(app.find(NativeQueryEditor).text()).toMatch(/Sample Dataset/)
        })

        it("lets you start a question from a metric", async () => {
            const store = await createTestStore()

            store.pushPath(Urls.newQuestion());
            const app = mount(store.getAppContainer());
            await store.waitForActions([RESET_QUERY, FETCH_METRICS, FETCH_SEGMENTS]);
            await store.waitForActions([SET_REQUEST_STATE]);

            click(app.find(NewQueryOption).filterWhere((c) => c.prop('title') === "Metrics"))
            await store.waitForActions(FETCH_DATABASES);
            await store.waitForActions([SET_REQUEST_STATE]);
            expect(store.getPath()).toBe("/question/new/metric")

            const entitySearch = app.find(EntitySearch)
            const viewByCreator = entitySearch.find(SearchGroupingOption).last()
            expect(viewByCreator.text()).toBe("Creator");
            click(viewByCreator)
            expect(store.getPath()).toBe("/question/new/metric?grouping=creator")

            const group = entitySearch.find(SearchResultsGroup)
            expect(group.prop('groupName')).toBe("Bobby Tables")

            const metricSearchResult = group.find(SearchResultListItem)
                .filterWhere((item) => /A Metric/.test(item.text()))
            click(metricSearchResult.childAt(0))

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
            await delay(100); // Trying to address random CI failures with a small delay

            expect(
                app.find(AggregationWidget).find(".View-section-aggregation").text()
            ).toBe("A Metric")
        })
    })

    describe("a newer instance", () => {

    })
})
