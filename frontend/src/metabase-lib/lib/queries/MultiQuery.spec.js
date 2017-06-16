// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import { question } from "metabase/__support__/sample_dataset_fixture";

import MultiQuery, { convertToMultiDatasetQuery } from "./MultiQuery";
import type { StructuredDatasetQuery } from "metabase/meta/types/Card";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Metric from "metabase-lib/lib/metadata/Metric";

/**
 * NOTE: These have been migrated from Questions which it used to have multimetrics methods
 * Test stubs (and later implementations) for other MultiQuery methods should be added as well
 */
const METRIC = {
    id: 123,
    table: {
        db: {
            id: 1
        }
    }
};
const DATASET_QUERY_WITH_ONE_METRIC: StructuredDatasetQuery = {
    type: "query",
    query: {
        aggregation: [["count"]]
    }
};
const DATASET_QUERY_WITH_TWO_METRICS: StructuredDatasetQuery = {
    type: "query",
    query: {
        aggregation: [["count"], ["sum", ["field-id", 1]]]
    }
};

describe("MultiQuery", () => {
    it("work with one query", () => {
        const query = new MultiQuery(
            question,
            convertToMultiDatasetQuery(question, DATASET_QUERY_WITH_ONE_METRIC)
        );
        expect(query.atomicQueries()).toHaveLength(1);
    });

    it("should add a new atomic query", () => {
        const newDatasetQuery = {
            type: "query",
            query: {
                aggregation: [["sum", ["field-id", 1]]]
            }
        };
        const query = new MultiQuery(
            question,
            convertToMultiDatasetQuery(question, DATASET_QUERY_WITH_ONE_METRIC)
        ).addQuery(new StructuredQuery(question, newDatasetQuery));

        expect(query.atomicQueries()).toHaveLength(2);
        expect(query.datasetQuery()).toEqual({
            type: "multi",
            queries: [DATASET_QUERY_WITH_ONE_METRIC, newDatasetQuery]
        });
    });

    // Needs the actual metadata
    xit("should add a new saved metric", () => {
        const query = new MultiQuery(
            question,
            convertToMultiDatasetQuery(question, DATASET_QUERY_WITH_ONE_METRIC)
        ).addSavedMetric(new Metric(METRIC));

        expect(query.atomicQueries()).toHaveLength(2);
        expect(query.datasetQuery()).toEqual({
            type: "multi",
            queries: [
                DATASET_QUERY_WITH_ONE_METRIC,
                {
                    type: "query",
                    query: {
                        aggregation: [["count"], ["METRIC", 123]]
                    }
                }
            ]
        });
    });

    it("should remove a query", () => {
        let query = new MultiQuery(
            question,
            convertToMultiDatasetQuery(question, DATASET_QUERY_WITH_TWO_METRICS)
        ).removeQueryAtIndex(1);

        expect(query.atomicQueries()).toHaveLength(1);
        expect(query.datasetQuery()).toEqual({
            type: "multi",
            queries: [DATASET_QUERY_WITH_ONE_METRIC]
        });
    });
});
