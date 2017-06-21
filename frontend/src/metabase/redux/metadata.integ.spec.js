/**
 * Goals for this test suite:
 * - serve as a documentation for how to use metadata loading actions
 * - see if the metadata gets properly hydrated in `getMetadata` of selectors/metadata
 * - see if metadata loading actions can be safely used in isolation from each others
 */
import { getMetadata } from "metabase/selectors/metadata"
import {
    createReduxStore,
    login,
    startServer,
    stopServer
} from "metabase/__support__/integrated_tests";
import {
    fetchMetrics,
    fetchSegments,
    fetchDatabases,
    fetchDatabaseMetadata,
    fetchTables,
    fetchDatabasesWithMetadata
} from "./metadata"

const metadata = (store) => getMetadata(store.getState())

describe("metadata/redux", () => {
    beforeAll(async () => {
        await startServer();
        await login();
    });

    afterAll(async () => {
        await stopServer();
    })

    describe("METRIC ACTIONS", () => {
        describe("fetchMetrics()", () => {
            it("fetches no metrics in empty db", async () => {
                const store = createReduxStore();
                await store.dispatch(fetchMetrics());
                expect(metadata(store).metricsList().length).toBe(0)
            })
        })
        describe("updateMetric(metric)", () => {
            // await store.dispatch(updateMetric(metric));
        })
        describe("updateMetricImportantFields(...)", () => {
            // await store.dispatch(updateMetricImportantFields(metricId, importantFieldIds));
        })
        describe("fetchMetricTable(metricId)", () => {
            // await store.dispatch(fetchMetricTable(metricId));
        })
        describe("fetchMetricRevisions(metricId)", () => {
            // await store.dispatch(fetchMetricRevisions(metricId));
        })
    })

    describe("SEGMENT ACTIONS", () => {
        describe("fetchSegments()", () => {
            // await store.dispatch(fetchSegments());
        })
        describe("updateSegment(segment)", () => {
            // await store.dispatch(updateSegment(segment));
        })
    })

    describe("DATABASE ACTIONS", () => {
        describe("fetchDatabases()", () => {
            it("fetches the sample dataset", async () => {
                const store = createReduxStore();
                expect(metadata(store).tablesList().length).toBe(0);
                expect(metadata(store).databasesList().length).toBe(0);

                await store.dispatch(fetchDatabases());
                expect(metadata(store).databasesList().length).toBe(1);
                expect(metadata(store).tablesList().length).toBe(4);
                expect(metadata(store).databasesList()[0].tables.length).toBe(4);
            })
        })
        describe("fetchDatabaseMetadata(dbId)", () => {
            // await store.dispatch(fetchDatabaseMetadata(1));
        })
        describe("updateDatabase(database)", () => {
            // await store.dispatch(updateDatabase(database));
        })
    })

    describe("TABLE ACTIONS", () => {
        describe("fetchTables()", () => {
            it("fetches the sample dataset tables", async () => {
                // what is the difference between fetchDatabases and fetchTables?
                const store = createReduxStore();
                expect(metadata(store).tablesList().length).toBe(0);
                expect(metadata(store).databasesList().length).toBe(0);

                await store.dispatch(fetchTables());
                expect(metadata(store).tablesList().length).toBe(4);
                expect(metadata(store).databasesList().length).toBe(1);
            })
            // await store.dispatch(fetchTables());
        })
        describe("updateTable(table)", () => {
            // await store.dispatch(updateTable(table));
        })
        describe("fetchTableMetadata(tableId)", () => {
            // await store.dispatch(fetchTableMetadata(tableId));
        })
        describe("fetchFieldValues(fieldId)", () => {
            // await store.dispatch(fetchFieldValues());
        })
    })

    describe("MISC ACTIONS", () => {
        describe("addParamValues(paramValues)", () => {
            // await store.dispatch(addParamValues(paramValues));
        })
        describe("updateField(field)", () => {
            // await store.dispatch(updateField(field));
        })
        describe("fetchRevisions(type, id)", () => {
            // await store.dispatch(fetchRevisions(type, id));
        })
        describe("fetchSegmentFields(segmentId)", () => {
            // await store.dispatch(fetchSegmentFields(segmentId));
        })
        describe("fetchSegmentRevisions(segments)", () => {
            // await store.dispatch(fetchSegmentRevisions(segmentId));
        })
        describe("fetchDatabasesWithMetadata()", () => {
            // await store.dispatch(fetchDatabasesWithMetadata());
        })
    })
})