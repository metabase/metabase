import Question from "./Question";

const METADATA = {};

const METRIC = {
    id: 123,
    table: {
        db: {
            id: 1
        }
    }
};

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

describe("Question", () => {
    it("work with one metric", () => {
        const question = new Question(METADATA, CARD_WITH_ONE_METRIC);
        expect(question.singleQueries()).toHaveLength(1);
        expect(question.card()).toEqual({
            dataset_query: {
                type: "query",
                query: {
                    aggregation: [["count"]]
                }
            }
        });
    });

    it("should add a new custom metric", () => {
        let question = new Question(METADATA, CARD_WITH_ONE_METRIC);
        question = question.addMetric({
            type: "query",
            query: {
                aggregation: [["sum", ["field-id", 1]]]
            }
        });
        expect(question.singleQueries()).toHaveLength(2);
        expect(question.card()).toEqual({
            dataset_query: {
                type: "query",
                query: {
                    aggregation: [["count"], ["sum", ["field-id", 1]]]
                }
            }
        });
    });

    it("should add a new saved metric", () => {
        let question = new Question(METADATA, CARD_WITH_ONE_METRIC);
        question = question.addSavedMetric(METRIC);
        expect(question.singleQueries()).toHaveLength(2);
        expect(question.card()).toEqual({
            dataset_query: {
                type: "query",
                query: {
                    aggregation: [["count"], ["METRIC", 123]]
                }
            }
        });
    });

    it("should remove a metric", () => {
        let question = new Question(METADATA, CARD_WITH_TWO_METRICS);
        question = question.removeMetric(0);
        expect(question.singleQueries()).toHaveLength(1);
        expect(question.card()).toEqual({
            dataset_query: {
                type: "query",
                query: {
                    aggregation: [["sum", ["field-id", 1]]]
                }
            }
        });
    });

    it("should add a filter", () => {
        let question = new Question(METADATA, CARD_WITH_TWO_METRICS);
        const query = question
            .singleQueries()[0]
            .addFilter(["=", ["field-id", 1], 42]);
        question = question.setQuery(query, 0);
        expect(question.metrics()).toHaveLength(2);
        expect(question.card()).toEqual({
            dataset_query: {
                type: "query",
                query: {
                    filter: ["=", ["field-id", 1], 42],
                    aggregation: [["count"], ["sum", ["field-id", 1]]]
                }
            }
        });
    });

    describe("canRun", () => {
        it("return false when a single metric can't run", () => {
            const question = new Question(METADATA, CARD_WITH_ONE_METRIC);
            question._queries[0].canRun = () => false;
            expect(question.canRun()).toBe(false);
        });
        it("return true when a single metric can run", () => {
            const question = new Question(METADATA, CARD_WITH_ONE_METRIC);
            question._queries[0].canRun = () => true;
            expect(question.canRun()).toBe(true);
        });
        it("return false when one of two metrics can't run", () => {
            const question = new Question(METADATA, CARD_WITH_TWO_METRICS);
            question._queries[0].canRun = () => true;
            question._queries[1].canRun = () => false;
            expect(question.canRun()).toBe(false);
        });
        it("return true when both metrics can run", () => {
            const question = new Question(METADATA, CARD_WITH_TWO_METRICS);
            question._queries[0].canRun = () => true;
            question._queries[1].canRun = () => true;
            expect(question.canRun()).toBe(true);
        });
    });
});
