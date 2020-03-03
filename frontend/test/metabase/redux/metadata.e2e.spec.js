/**
 * Goals for this test suite:
 * - serve as a documentation for how to use metadata loading actions
 * - see if the metadata gets properly hydrated in `getMetadata` of selectors/metadata
 * - see if metadata loading actions can be safely used in isolation from each others
 */
import { getMetadata } from "metabase/selectors/metadata";
import { createTestStore, useSharedAdminLogin } from "__support__/e2e";
import { fetchMetrics, fetchTables } from "metabase/redux/metadata";

const metadata = store => getMetadata(store.getState());

describe("metadata/redux", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("METRIC ACTIONS", () => {
    // TODO Atte Keinänen 6/23/17: Remove metrics after their creation in other tests
    describe("fetchMetrics()", () => {
      pending();
      it("fetches no metrics in empty db", async () => {
        const store = createTestStore();
        await store.dispatch(fetchMetrics());
        expect(metadata(store).metricsList().length).toBe(0);
      });
    });
    describe("updateMetric(metric)", () => {
      // await store.dispatch(updateMetric(metric));
    });
    describe("updateMetricImportantFields(...)", () => {
      // await store.dispatch(updateMetricImportantFields(metricId, importantFieldIds));
    });
    describe("fetchMetricTable(metricId)", () => {
      // await store.dispatch(fetchMetricTable(metricId));
    });
    describe("fetchMetricRevisions(metricId)", () => {
      // await store.dispatch(fetchMetricRevisions(metricId));
    });
  });

  describe("SEGMENT ACTIONS", () => {
    describe("fetchSegments()", () => {
      // await store.dispatch(fetchSegments());
    });
    describe("updateSegment(segment)", () => {
      // await store.dispatch(updateSegment(segment));
    });
  });

  describe("DATABASE ACTIONS", () => {
    describe("fetchDatabaseMetadata(dbId)", () => {
      // await store.dispatch(fetchDatabaseMetadata(1));
    });
    describe("updateDatabase(database)", () => {
      // await store.dispatch(updateDatabase(database));
    });
  });

  describe("TABLE ACTIONS", () => {
    describe("fetchTables()", () => {
      // TODO Atte Keinänen 6/23/17: Figure out why on CI two databases show up but locally only one
      pending();
      it("fetches the sample dataset tables", async () => {
        // what is the difference between fetchDatabases and fetchTables?
        const store = createTestStore();
        expect(metadata(store).tablesList().length).toBe(0);
        expect(metadata(store).databasesList().length).toBe(0);

        await store.dispatch(fetchTables());
        expect(metadata(store).tablesList().length).toBe(4);
        expect(metadata(store).databasesList().length).toBe(1);
      });
      // await store.dispatch(fetchTables());
    });
    describe("updateTable(table)", () => {
      // await store.dispatch(updateTable(table));
    });
    describe("fetchTableMetadata(tableId)", () => {
      // await store.dispatch(fetchTableMetadata(tableId));
    });
    describe("fetchFieldValues(fieldId)", () => {
      // await store.dispatch(fetchFieldValues());
    });
  });

  describe("MISC ACTIONS", () => {
    describe("addParamValues(paramValues)", () => {
      // await store.dispatch(addParamValues(paramValues));
    });
    describe("updateField(field)", () => {
      // await store.dispatch(updateField(field));
    });
    describe("fetchRevisions(type, id)", () => {
      // await store.dispatch(fetchRevisions(type, id));
    });
    describe("fetchSegmentFields(segmentId)", () => {
      // await store.dispatch(fetchSegmentFields(segmentId));
    });
    describe("fetchSegmentRevisions(segments)", () => {
      // await store.dispatch(fetchSegmentRevisions(segmentId));
    });
  });
});
