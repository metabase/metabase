// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import {
    metadata,
    question,
    DATABASE_ID,
    ORDERS_TABLE_ID,
} from "metabase/__support__/sample_dataset_fixture";

import StructuredQuery from "./StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

function makeDatasetQuery(queryText, templateTags) {
    return {
        type: "native",
        database: DATABASE_ID,
        query: {
            query: queryText,
            template_tags: templateTags
        }
    };
}

function makeQuery(query, templateTags) {
    return new NativeQuery(question, makeDatasetQuery(query, templateTags));
}

const query: NativeQuery = makeQuery("");

describe("NativeQuery", () => {
    describe("DB METADATA METHODS", () => {
        describe("tables()", () => {
            it("Tables should return multiple tables", () => {
                expect(Array.isArray(query.tables())).toBe(true);
            });
            it("Tables should return a table map that includes fields", () => {
                expect(Array.isArray(query.tables()[0].fields)).toBe(true);
            });
        });
        describe("databaseId()", () => {
            it("returns the Database ID of the wrapped query ", () => {
                expect(query.databaseId()).toBe(DATABASE_ID);
            });
        });
        describe("database()", () => {
            it("returns a dictionary with the underlying database of the wrapped query", () => {
                expect(query.database().id).toBe(DATABASE_ID);
            });
        });

        describe("engine()", () => {
            it("identifies the engine of a query", () => {
                // This is a magic constant and we should probably pull this up into an enum
                expect(query.engine()).toBe("h2");
            });
        });
        describe("supportsNativeParameters()", () => {
            pending();
        })
        describe("aceMode()", () => {
            pending();
        })
    })

    describe("QUERY STATUS METHODS", () => {
        describe("isEmpty()", () => {
            it("tells that an empty query is empty", () => {
                expect(query.isEmpty()).toBe(true);
            });
        });
    });

    describe("METHODS RELATED TO DBS WHICH REQUIRE THAT TABLE IS CHOSEN (I.E. MONGO)", () => {
        // should we somehow simulate a mongo query here?
        // NOTE: Would be nice to have QB UI tests for mongo-specific interactions as well
        describe("requiresTable()", () => {
            pending();
        })
        describe("collection()", () => {
            pending();
        })
        describe("updateCollection(newCollection)", () => {
            pending();
        })
        describe("table()", () => {
            it("returns null for a non-mongo query", () => {
                expect(query.table()).toBe(null);
                expect(query.updateQueryText("SELECT * FROM ORDERS").table()).toBe(null);
            });
        });
    })
    describe("QUERY TEXT METHODS", () => {
        describe("queryText()", () => {
            pending();
        })
        describe("updateQueryText(newQueryText)", () => {
            pending();
        })
        describe("lineCount()", () => {
            pending();
        })
    })
    describe("TEMPLATE TAG METHODS", () => {
        describe("templateTags()", () => {
            pending();
        })
        describe("templateTagsMap()", () => {
            pending();
        })
    });
})