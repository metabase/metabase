import Question from "./Question";

import {
    metadata,
    ORDERS_PK_FIELD_ID,
    PRODUCT_CATEGORY_FIELD_ID,
    ORDERS_CREATED_DATE_FIELD_ID,
    DATABASE_ID,
    ORDERS_TABLE_ID,
    ORDERS_TOTAL_FIELD_ID,
    MAIN_METRIC_ID,
    ORDERS_PRODUCT_FK_FIELD_ID
} from "metabase/__support__/sample_dataset_fixture";

const METADATA = {};

const CARD_WITH_ONE_METRIC = {
    dataset_query: {
        type: "query",
        query: {
            aggregation: [["count"]]
        }
    }
};

const CARD_WITH_TWO_METRICS = {
    dataset_query: {
        type: "query",
        query: {
            aggregation: [["count"], ["sum", ["field-id", 1]]]
        }
    }
};

export const ordersRawDataCard = {
    id: 1,
    name: "Raw orders data",
    dataset_query: {
        type: "query",
        database: DATABASE_ID,
        query: {
            source_table: ORDERS_TABLE_ID
        }
    }
};

describe("Question", () => {
    describe("can Run", () => {
        it("return false when a single metric can't run", () => {
            const question = new Question(
                METADATA,
                CARD_WITH_ONE_METRIC
            ).convertToMultiQuery();
            question.multiQuery().atomicQueries()[0].canRun = () => false;
            expect(question.canRun()).toBe(false);
        });
        it("return true when a single metric can run", () => {
            const question = new Question(
                METADATA,
                CARD_WITH_ONE_METRIC
            ).convertToMultiQuery();
            question.multiQuery().atomicQueries()[0].canRun = () => true;
            expect(question.canRun()).toBe(true);
        });
        it("return false when one of two metrics can't run", () => {
            const question = new Question(
                METADATA,
                CARD_WITH_TWO_METRICS
            ).convertToMultiQuery();
            question.multiQuery().atomicQueries()[0].canRun = () => true;
            question.multiQuery().atomicQueries()[1].canRun = () => false;
            expect(question.canRun()).toBe(false);
        });
        it("return true when both metrics can run", () => {
            const question = new Question(
                METADATA,
                CARD_WITH_TWO_METRICS
            ).convertToMultiQuery();
            question.multiQuery().atomicQueries()[0].canRun = () => true;
            question.multiQuery().atomicQueries()[1].canRun = () => true;
            expect(question.canRun()).toBe(true);
        });
    });

    describe("can Create properly", () => {
        const question = new Question(metadata, ordersRawDataCard);
        it("a newly created question has a name", () => {
            expect(question.isEmpty()).toBe(false);
        });
        it("a newly created question has a id", () => {
            expect(question.id()).toBe(ordersRawDataCard.id);
        });
        it("a newly created question is not empty", () => {
            expect(question.displayName()).toBe(ordersRawDataCard.name);
        });
        it("a newly created question is not a multiQuery", () => {
            expect(question.isMultiQuery()).toBe(false);
        });
        it("a newly created question can be run", () => {
            expect(question.canRun()).toBe(true);
        });
        it("a newly created question doesn't have a display set", () => {
            expect(question.display()).toBeUndefined();
        });
        it("a newly created raw data question has is in segment mode", () => {
            expect(question.mode().name).toBe("segment");
        });
        it("a cloned query unsets ids and name", () => {
            expect(question.newQuestion().displayName()).toBeUndefined();
            expect(question.newQuestion().id()).toBeUndefined();
        });
    });

    describe("has Actions", () => {
        const question = new Question(metadata, ordersRawDataCard);
        it("a new raw data question has actions", () => {
            expect(question.actions().length).toBe(4);
        });
        it("a new raw data question's actions that start with underlying data", () => {
            expect(question.actions()[0].name).toBe("underlying-data");
            expect(question.actions()[0].icon).toBe("table");
            expect(question.actions()[0].title).toBe("View this as a table");
        });
        it("a new raw data question's action 2 is the defined metric", () => {
            expect(question.actions()[1].name).toBe("common-metric");
            // TODO: Sameer 6/16/17
            // This is wack and not really testable. We shouldn't be passing around react components in this imo
            // expect(question.actions()[1].title.props.children).toBe("Total Order Value");
        });
        it("a new raw data question's action 3 is a count timeseries", () => {
            expect(question.actions()[2].name).toBe("count-by-time");
            expect(question.actions()[2].icon).toBe("line");
            // TODO: Sameer 6/16/17
            // This is wack and not really testable. We shouldn't be passing around react components in this imo
            // expect(question.actions()[2].title.props.children).toBe("Count of rows by time");
        });
        it("a new raw data question's action 4 is summarize", () => {
            expect(question.actions()[3].name).toBe("summarize");
            expect(question.actions()[3].icon).toBe("sum");
            expect(question.actions()[3].title).toBe("Summarize this segment");
        });
    });

    describe("canFilter", () => {
        const question = new Question(metadata, ordersRawDataCard);

        it("filtering by an id works", () => {
            const filteringQuestion = question.filter(
                "=",
                ORDERS_PK_FIELD_ID,
                1
            );

            expect(filteringQuestion.query).toEqual(
                (dataset_query: {
                    type: "query",
                    database: DATABASE_ID,
                    query: {
                        source_table: ORDERS_TABLE_ID,
                        filter: ["=", ORDERS_PK_FIELD_ID, 1]
                    }
                })
            );
        });
        it("filtering by a categorical value works", () => {
            const filteringQuestion = question.filter(
                "=",
                ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_CATEGORY_FIELD_ID],
                "Doohickey"
            );

            expect(filteringQuestion.query).toEqual(
                (dataset_query: {
                    type: "query",
                    database: DATABASE_ID,
                    query: {
                        source_table: ORDERS_TABLE_ID,
                        filter: ["=", ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_CATEGORY_FIELD_ID], "Doohickey"]
                    }
                })
            );
        });

        it("filtering by a time works", () => {
            const filteringQuestion = question.filter(
                "=",
                ORDERS_CREATED_DATE_FIELD_ID,
                "12/12/2012"
            );

            expect(filteringQuestion.query).toEqual(
                (dataset_query: {
                    type: "query",
                    database: DATABASE_ID,
                    query: {
                        source_table: ORDERS_TABLE_ID,
                        filter: ["=", ORDERS_CREATED_DATE_FIELD_ID, "12/12/2012"]
                    }
                })
            );
        });
    });

    describe("canBreakout", () => {
        it("breakout results in a correct breakout", () => {
            expect(true).toBe(true);
        });
    });

    describe("canPivot", () => {});

    describe("canDrill", () => {
        it("returns the correct query for a PK detail drill-through", () => {
            expect(true).toBe(true);
        });
    });

    describe("canSummarize", () => {
        it("returns the correct query for a summarization of a raw data table", () => {
            expect(true).toBe(true);
        });
    });

    describe("canShowUnderlying", () => {
        it("returns underlying records correctly for a raw data query", () => {
            expect(true).toBe(true);
        });
        it("returns underlying records correctly for a broken out query", () => {
            expect(true).toBe(true);
        });
        it("returns underlying data correctly for table query", () => {
            expect(true).toBe(true);
        });
        it("returns underlying data correctly for line chart", () => {
            expect(true).toBe(true);
        });
    });

    describe("canIterativelyQuery", () => {
        it("does stuff", () => {
            expect(true).toBe(true);
        });
    });
});
