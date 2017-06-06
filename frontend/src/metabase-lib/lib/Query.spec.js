/* @flow weak */

declare var describe: any;
declare var it: any;
declare var xit: any;
declare var expect: any;

// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import StructuredQuery from "./StructuredQuery";

const FIELD = {
    id: 1,
    display_name: "Field"
};

const _metadata = {
    fields: {
        "1": FIELD
    },
    metrics: {
        "1": {
            name: "Metric"
        }
    },
    tables: {
        "1": {
            fields: [FIELD]
        }
    }
};

const mockQuestion = {
    _metadata
};

const makeDatasetQuery = agg => ({
    type: "query",
    database: 1,
    query: {
        source_table: 1,
        aggregation: [agg]
    }
});

describe("Query", () => {
    describe("aggregationName", () => {
        it("should return a saved metric's name", () => {
            expect(
                new StructuredQuery(
                    mockQuestion,
                    0,
                    makeDatasetQuery(["METRIC", 1])
                ).aggregationName()
            ).toBe("Metric");
        });
        it("should return a standard aggregation name", () => {
            expect(
                new StructuredQuery(
                    mockQuestion,
                    0,
                    makeDatasetQuery(["count"])
                ).aggregationName()
            ).toBe("Count of rows");
        });
        it("should return a standard aggregation name with field", () => {
            expect(
                new StructuredQuery(
                    mockQuestion,
                    0,
                    makeDatasetQuery(["sum", ["field-id", 1]])
                ).aggregationName()
            ).toBe("Sum of Field");
        });
        xit("should return a standard aggregation name with fk field", () => {
            expect(
                new StructuredQuery(
                    mockQuestion,
                    0,
                    makeDatasetQuery(["sum", ["fk", 2, 3]])
                ).aggregationName()
            ).toBe("Sum of Field");
        });
        it("should return a custom expression description", () => {
            expect(
                new StructuredQuery(
                    mockQuestion,
                    0,
                    makeDatasetQuery(["+", 1, ["sum", ["field-id", 1]]])
                ).aggregationName()
            ).toBe("1 + Sum(Field)");
        });
        it("should return a named expression name", () => {
            expect(
                new StructuredQuery(
                    mockQuestion,
                    0,
                    makeDatasetQuery([
                        "named",
                        ["sum", ["field-id", 1]],
                        "Named"
                    ])
                ).aggregationName()
            ).toBe("Named");
        });
    });
});
