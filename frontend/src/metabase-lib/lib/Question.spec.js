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

export const ordersCountDataCard = {
    id: 2,
    name: "# orders data",
    dataset_query: {
        type: "query",
        database: DATABASE_ID,
        query: {
            aggregation: [["count"]],
            source_table: ORDERS_TABLE_ID
        }
    }
};

export const ordersCountByIDDataCard = {
    id: 2,
    name: "# orders data",
    dataset_query: {
        type: "query",
        database: DATABASE_ID,
        query: {
            aggregation: [["count"]],
            source_table: ORDERS_TABLE_ID,
            breakout: [["field-id", ORDERS_PK_FIELD_ID]]
        }
    }
};

const ORDERS_PRODUCT_CATEGORY = [
    "fk->",
    ORDERS_PRODUCT_FK_FIELD_ID,
    PRODUCT_CATEGORY_FIELD_ID
];

describe("Question", () => {
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

        it("a question with an aggregation and a time breakout has pivot actions", () => {
            const timeBreakoutQuestion = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
                .query()
                .addAggregation(["count"])
                .addBreakout(["datetime-field", ["field-id", 1], "day"])
                .question()
                .setDisplay("table");

            expect(timeBreakoutQuestion.actions().length).toBe(3);
            expect(timeBreakoutQuestion.actions()[0].name).toBe("pivot-by-category");
            expect(timeBreakoutQuestion.actions()[1].name).toBe("pivot-by-location");
        })
    });

    describe("canFilter", () => {
        const question = new Question(metadata, ordersRawDataCard);

        it("filtering by an id works", () => {
            const filteringQuestion = question.filter(
                "=",
                { id: ORDERS_PK_FIELD_ID },
                1
            );

            expect(filteringQuestion._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    filter: ["=", ["field-id", ORDERS_PK_FIELD_ID], 1]
                }
            });
        });
        it("filtering by a categorical value works", () => {
            const filteringQuestion = question.filter(
                "=",
                {
                    id: PRODUCT_CATEGORY_FIELD_ID,
                    fk_field_id: ORDERS_PRODUCT_FK_FIELD_ID
                },
                "Doohickey"
            );

            expect(filteringQuestion._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    filter: [
                        "=",
                        [
                            "fk->",
                            ORDERS_PRODUCT_FK_FIELD_ID,
                            PRODUCT_CATEGORY_FIELD_ID
                        ],
                        "Doohickey"
                    ]
                }
            });
        });

        it("filtering by a time works", () => {
            const filteringQuestion = question.filter(
                "=",
                { id: ORDERS_CREATED_DATE_FIELD_ID },
                "12/12/2012"
            );

            expect(filteringQuestion._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    filter: [
                        "=",
                        ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
                        "12/12/2012"
                    ]
                }
            });
        });
    });

    describe("canBreakout", () => {
        it("can be broken out by a datetime", () => {
            const ordersCountQuestion = new Question(
                metadata,
                ordersCountDataCard
            );
            const brokenOutCard = ordersCountQuestion.breakout([
                "field-id",
                ORDERS_CREATED_DATE_FIELD_ID
            ]);
            expect(brokenOutCard.canRun()).toBe(true);

            expect(brokenOutCard._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    aggregation: [["count"]],
                    breakout: [["field-id", ORDERS_CREATED_DATE_FIELD_ID]]
                }
            });

            // Make sure we haven't mutated the underlying query
            expect(ordersCountDataCard.dataset_query.query).toEqual({
                source_table: ORDERS_TABLE_ID,
                aggregation: [["count"]]
            });
        });
        it("can be broken out by a PK", () => {
            const ordersCountQuestion = new Question(
                metadata,
                ordersCountDataCard
            );
            const brokenOutCard = ordersCountQuestion.breakout([
                "field-id",
                ORDERS_PK_FIELD_ID
            ]);
            expect(brokenOutCard.canRun()).toBe(true);
            // This breaks because we're apparently modifying OrdersCountDataCard
            expect(brokenOutCard._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    aggregation: [["count"]],
                    breakout: [["field-id", ORDERS_PK_FIELD_ID]]
                }
            });

            // Make sure we haven't mutated the underlying query
            expect(ordersCountDataCard.dataset_query.query).toEqual({
                source_table: ORDERS_TABLE_ID,
                aggregation: [["count"]]
            });
        });
    });

    describe("canPivot", () => {
        const ordersCountQuestion = new Question(metadata, ordersCountDataCard);
        it("pivoting by datetime dimension works", () => {
            const pivotedCard = ordersCountQuestion.pivot([
                "field-id",
                ORDERS_CREATED_DATE_FIELD_ID
            ]);
            expect(pivotedCard.canRun()).toBe(true);

            // if I actually call the .query() method below, this blows up garbage collection =/
            expect(pivotedCard._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    aggregation: [["count"]],
                    breakout: [["field-id", ORDERS_CREATED_DATE_FIELD_ID]]
                }
            });
            // Make sure we haven't mutated the underlying query
            expect(ordersCountDataCard.dataset_query.query).toEqual({
                source_table: ORDERS_TABLE_ID,
                aggregation: [["count"]]
            });
        });
        it("pivoting by a PK dimension works", () => {
            const pivotedCard = ordersCountQuestion.pivot([
                "field-id",
                ORDERS_PK_FIELD_ID
            ]);
            expect(pivotedCard.canRun()).toBe(true);

            // if I actually call the .query() method below, this blows up garbage collection =/
            expect(pivotedCard._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    aggregation: [["count"]],
                    breakout: [["field-id", ORDERS_PK_FIELD_ID]]
                }
            });
            // Make sure we haven't mutated the underlying query
            expect(ordersCountDataCard.dataset_query.query).toEqual({
                source_table: ORDERS_TABLE_ID,
                aggregation: [["count"]]
            });
        });
    });

    describe("canDrill", () => {
        const question = new Question(metadata, ordersRawDataCard);
        it("returns the correct query for a PK detail drill-through", () => {
            const drilledQuestion = question.drillPK(
                metadata.fields[ORDERS_PK_FIELD_ID],
                1
            );

            expect(drilledQuestion.canRun()).toBe(true);

            // if I actually call the .query() method below, this blows up garbage collection =/
            expect(drilledQuestion._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    filter: ["=", ["field-id", ORDERS_PK_FIELD_ID], 1]
                }
            });
        });
    });

    describe("canSummarize", () => {
        const question = new Question(metadata, ordersRawDataCard);
        it("returns the correct query for a summarization of a raw data table", () => {
            const summarizedQuestion = question.summarize(["count"]);
            expect(summarizedQuestion.canRun()).toBe(true);
            // if I actually call the .query() method below, this blows up garbage collection =/
            expect(summarizedQuestion._card.dataset_query).toEqual(
                ordersCountDataCard.dataset_query
            );
        });
    });

    describe("canDrillUnderlyingRecords", () => {
        const ordersCountQuestion = new Question(
            metadata,
            ordersCountByIDDataCard
        );
        it("Properly apply a filter to a given filterspec", () => {
            const dimensions = [
                { value: 1, column: metadata.fields[ORDERS_PK_FIELD_ID] }
            ];

            const drilledQuestion = ordersCountQuestion.drillUnderlyingRecords(
                dimensions
            );
            expect(drilledQuestion.canRun()).toBe(true);

            expect(drilledQuestion._card.dataset_query).toEqual({
                type: "query",
                database: DATABASE_ID,
                query: {
                    source_table: ORDERS_TABLE_ID,
                    filter: ["=", ["field-id", ORDERS_PK_FIELD_ID], 1]
                }
            });
        });
    });

    describe("canShowUnderlying", () => {
        const question = new Question(metadata, ordersRawDataCard);
        const ordersCountQuestion = new Question(metadata, ordersCountDataCard);

        it("returns underlying records correctly for a raw data query", () => {
            const underlyingRecordsQuestion = question.toUnderlyingRecords();

            expect(underlyingRecordsQuestion.canRun()).toBe(true);
            // if I actually call the .query() method below, this blows up garbage collection =/
            expect(underlyingRecordsQuestion._card.dataset_query).toEqual(
                ordersRawDataCard.dataset_query
            );

            // Make sure we haven't mutated the underlying query
            expect(ordersRawDataCard.dataset_query.query).toEqual({
                source_table: ORDERS_TABLE_ID
            });
        });
        it("returns underlying records correctly for a broken out query", () => {
            const underlyingRecordsQuestion = ordersCountQuestion.toUnderlyingRecords();

            expect(underlyingRecordsQuestion.canRun()).toBe(true);
            // if I actually call the .query() method below, this blows up garbage collection =/
            expect(underlyingRecordsQuestion._card.dataset_query).toEqual(
                ordersRawDataCard.dataset_query
            );

            // Make sure we haven't mutated the underlying query
            expect(ordersRawDataCard.dataset_query.query).toEqual({
                source_table: ORDERS_TABLE_ID
            });
        });
        it("returns underlying data correctly for table query", () => {
            const underlyingDataQuestion = ordersCountQuestion
                .setDisplay("table")
                .toUnderlyingData();

            expect(underlyingDataQuestion.display()).toBe("table");
        });
        it("returns underlying data correctly for line chart", () => {
            const underlyingDataQuestion = ordersCountQuestion
                .setDisplay("line")
                .toUnderlyingData();

            expect(underlyingDataQuestion.display()).toBe("table");
        });
    });

    describe("canIterativelyQuery", () => {
        it("does stuff", () => {
            expect(true).toBe(true);
        });
    });
});
