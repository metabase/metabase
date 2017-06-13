// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import {
    question,
    DATABASE_ID,
    MAIN_TABLE_ID,
    MAIN_FLOAT_FIELD_ID,
    MAIN_METRIC_ID,
    MAIN_FK_FIELD_ID,
    FOREIGN_TEXT_FIELD_ID
} from "metabase/__support__/fixtures";

import StructuredQuery from "./StructuredQuery";

const makeDatasetQuery = agg => ({
    type: "query",
    database: DATABASE_ID,
    query: {
        source_table: MAIN_TABLE_ID,
        aggregation: [agg]
    }
});

describe("StructuredQuery", () => {
    describe("aggregationName", () => {
        it("should return a saved metric's name", () => {
            expect(
                new StructuredQuery(
                    question,
                    makeDatasetQuery(["METRIC", MAIN_METRIC_ID])
                ).aggregationName()
            ).toBe("Mock Metric");
        });
        it("should return a standard aggregation name", () => {
            expect(
                new StructuredQuery(
                    question,
                    makeDatasetQuery(["count"])
                ).aggregationName()
            ).toBe("Count of rows");
        });
        it("should return a standard aggregation name with field", () => {
            expect(
                new StructuredQuery(
                    question,
                    makeDatasetQuery(["sum", ["field-id", MAIN_FLOAT_FIELD_ID]])
                ).aggregationName()
            ).toBe("Sum of Mock Float Field");
        });
        it("should return a standard aggregation name with fk field", () => {
            expect(
                new StructuredQuery(
                    question,
                    makeDatasetQuery([
                        "sum",
                        ["fk->", MAIN_FK_FIELD_ID, FOREIGN_TEXT_FIELD_ID]
                    ])
                ).aggregationName()
            ).toBe("Sum of Mock Foreign Text Field");
        });
        it("should return a custom expression description", () => {
            expect(
                new StructuredQuery(
                    question,
                    makeDatasetQuery([
                        "+",
                        1,
                        ["sum", ["field-id", MAIN_FLOAT_FIELD_ID]]
                    ])
                ).aggregationName()
            ).toBe('1 + Sum("Mock Float Field")');
        });
        it("should return a named expression name", () => {
            expect(
                new StructuredQuery(
                    question,
                    makeDatasetQuery([
                        "named",
                        ["sum", ["field-id", MAIN_FLOAT_FIELD_ID]],
                        "Named"
                    ])
                ).aggregationName()
            ).toBe("Named");
        });
    });
});
