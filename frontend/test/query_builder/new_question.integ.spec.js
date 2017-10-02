import { mount } from "enzyme"

import {
    useSharedAdminLogin,
    createTestStore,
} from "__support__/integrated_tests";

import EntitySearch, {
    SearchGroupingOption,
    SearchResultListItem,
    SearchResultsGroup
} from "metabase/containers/EntitySearch";

import FilterWidget from "metabase/query_builder/components/filters/FilterWidget";
import AggregationWidget from "metabase/query_builder/components/AggregationWidget";

import {
    click,
    setInputValue
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

import { MetabaseApi, MetricApi, SegmentApi } from "metabase/services";
import { SET_REQUEST_STATE } from "metabase/redux/requests";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import NewQueryOption from "metabase/new_query/components/NewQueryOption";
import SearchHeader from "metabase/components/SearchHeader";
import EmptyState from "metabase/components/EmptyState";
import _ from "underscore"

describe("new question flow", async () => {
    // test an instance with segments, metrics, etc as an admin
    describe("a rich instance", async () => {
        let metricId = null;
        let segmentId = null;
        let segmentId2 = null;

        beforeAll(async () => {
            await useSharedAdminLogin()
            // TODO: Move these test metric/segment definitions to a central place
            const metricDef = {name: "A Metric", description: "For testing new question flow", table_id: 1,show_in_getting_started: true,
                definition: {database: 1, query: {aggregation: ["count"]}}}
            const segmentDef = {name: "A Segment", description: "For testing new question flow", table_id: 1, show_in_getting_started: true,
                definition: {database: 1, query: {filter: ["abc"]}}}
            const segmentDef2 = {name: "Another Segment", description: "For testing NQF table search", table_id: 1, show_in_getting_started: true,
                definition: {database: 1, query: {filter: ["abc"]}}}

            // Needed for question creation flow
            metricId = (await MetricApi.create(metricDef)).id;
            segmentId = (await SegmentApi.create(segmentDef)).id;
            segmentId2 = (await SegmentApi.create(segmentDef2)).id;
        })

        afterAll(async () => {
            await MetricApi.delete({ metricId, revision_message: "The lifetime of this metric was just a few seconds" })
            await SegmentApi.delete({ segmentId, revision_message: "Sadly this segment didn't enjoy a long life either" })
            await SegmentApi.delete({ segmentId: segmentId2, revision_message: "Sadly this segment didn't enjoy a long life either" })
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

            expect(app.find(NewQueryOption).length).toBe(4)
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

        it("lets you start a question from a table", async () => {
            const store = await createTestStore()

            store.pushPath(Urls.newQuestion());
            const app = mount(store.getAppContainer());
            await store.waitForActions([RESET_QUERY, FETCH_METRICS, FETCH_SEGMENTS]);
            await store.waitForActions([SET_REQUEST_STATE]);

            click(app.find(NewQueryOption).filterWhere((c) => c.prop('title') === "Tables"))
            await store.waitForActions(FETCH_DATABASES);
            await store.waitForActions([SET_REQUEST_STATE]);
            expect(store.getPath()).toBe("/question/new/table")

            const entitySearch = app.find(EntitySearch)

            // test comprehensively the table/segment search text filtering
            const searchInput = entitySearch.find(SearchHeader).find("input")

            // should find no entities and show no results found state
            setInputValue(searchInput, "Oders")
            expect(store.getPath()).toBe("/question/new/table?search=Oders")
            expect(entitySearch.find(EmptyState).length).toBe(1)

            // when searching with table name, should show the table and all segments it contains
            setInputValue(searchInput, "Orders")
            expect(store.getPath()).toBe("/question/new/table?search=Orders")
            expect(entitySearch.find(EmptyState).length).toBe(0)
            expect(entitySearch.find(SearchResultListItem).length).toBe(3)

            // when searching with segment name, should show the segment and its parent table
            setInputValue(searchInput, "Another Segment")
            expect(store.getPath()).toBe("/question/new/table?search=Another%20Segment")
            expect(entitySearch.find(EmptyState).length).toBe(0)
            expect(entitySearch.find(SearchResultListItem).length).toBe(2)

            // should let you start a question from a table (which is parent of the filtered segment)
            const tableSearchResult = entitySearch.find(SearchResultListItem).first()
            click(tableSearchResult.childAt(0))

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
            expect(app.find(DataSelector).text()).toEqual("Orders")
        })

        it("lets you start a question from a segment in Tables view", async () => {
            const store = await createTestStore()

            store.pushPath(Urls.newQuestion());
            const app = mount(store.getAppContainer());
            await store.waitForActions([RESET_QUERY, FETCH_METRICS, FETCH_SEGMENTS]);
            await store.waitForActions([SET_REQUEST_STATE]);

            click(app.find(NewQueryOption).filterWhere((c) => c.prop('title') === "Tables"))
            await store.waitForActions(FETCH_DATABASES);
            await store.waitForActions([SET_REQUEST_STATE]);
            expect(store.getPath()).toBe("/question/new/table")

            const entitySearch = app.find(EntitySearch)
            const viewByDatabase = entitySearch.find(SearchGroupingOption).at(1)
            expect(viewByDatabase.text()).toBe("Database");
            click(viewByDatabase)
            expect(store.getPath()).toBe("/question/new/table?grouping=database")

            const group = entitySearch.find(SearchResultsGroup)
                .filterWhere((group) => group.prop('groupName') === "Sample Dataset")

            const metricSearchResult = group.find(SearchResultListItem)
                .filterWhere((item) => /A Segment/.test(item.text()))
            click(metricSearchResult.childAt(0))

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
            expect(app.find(FilterWidget).find(".Filter-section-value").text()).toBe("A Segment")
        })

        // This performance test is expected not to cause a timeout
        it("should be performant with a high number of dbs, tables and segments", async () => {
            // Mock the metadata API endpoints so that they return a high number of results
            const realSegmentListEndpoint = SegmentApi.list
            const realDatabaseListEndpoint = MetabaseApi.db_list_with_tables

            const realSegment = (await realSegmentListEndpoint())[0]
            const realDatabase = (await realDatabaseListEndpoint())[0]
            const realTable = realDatabase.tables[0]

            const SEGMENT_COUNT = 200
            const TABLE_COUNT = 10000
            const DATABASE_COUNT = 30
            const TABLES_PER_DATABASE = TABLE_COUNT / DATABASE_COUNT

            const generateDatabaseWithTablesWithId = (id) => ({
                ...realDatabase,
                "id": id,
                "name": `Auto-generated database ${id}`,
                "tables": _.range(id * TABLES_PER_DATABASE, (id + 1) * TABLES_PER_DATABASE).map(generateTableWithId)
            })
            const generateTableWithId = (id) => ({
                ...realTable,
                "id": id,
                "name": `Auto-generated table ${id}`
            })
            const generateSegmentWithId = (id) => ({
                ...realSegment,
                "table_id": Math.floor(Math.random() * TABLE_COUNT),
                "name": `Auto-generated segment ${id}`,
                "id": id,
            })

            try {
                MetabaseApi.db_list_with_tables = () => _.range(DATABASE_COUNT).map(generateDatabaseWithTablesWithId)
                SegmentApi.list = () => _.range(SEGMENT_COUNT).map(generateSegmentWithId)

                const store = await createTestStore()

                store.pushPath(Urls.newQuestion());
                const app = mount(store.getAppContainer());
                await store.waitForActions([RESET_QUERY, FETCH_METRICS, FETCH_SEGMENTS]);
                await store.waitForActions([SET_REQUEST_STATE]);

                click(app.find(NewQueryOption).filterWhere((c) => c.prop('title') === "Tables"))
                await store.waitForActions(FETCH_DATABASES);
                await store.waitForActions([SET_REQUEST_STATE]);
                expect(store.getPath()).toBe("/question/new/table")
            } finally {
                SegmentApi.list = realSegmentListEndpoint
                MetabaseApi.db_list_with_tables = realDatabaseListEndpoint
            }
        })
    })

    describe("a newer instance", () => {

    })
})
