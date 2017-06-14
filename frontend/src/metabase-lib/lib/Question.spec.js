import Question from "./Question";

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

describe("Question", () => {
    describe("canRun", () => {
        it("return false when a single metric can't run", () => {
            const question = new Question(METADATA, CARD_WITH_ONE_METRIC).convertToMultiQuery();
            question.multiQuery().atomicQueries()[0].canRun = () => false;
            expect(question.canRun()).toBe(false);
        });
        it("return true when a single metric can run", () => {
            const question = new Question(METADATA, CARD_WITH_ONE_METRIC).convertToMultiQuery();
            question.multiQuery().atomicQueries()[0].canRun = () => true;
            expect(question.canRun()).toBe(true);
        });
        it("return false when one of two metrics can't run", () => {
            const question = new Question(METADATA, CARD_WITH_TWO_METRICS).convertToMultiQuery();
            question.multiQuery().atomicQueries()[0].canRun = () => true;
            question.multiQuery().atomicQueries()[1].canRun = () => false;
            expect(question.canRun()).toBe(false);
        });
        it("return true when both metrics can run", () => {
            const question = new Question(METADATA, CARD_WITH_TWO_METRICS).convertToMultiQuery();
            question.multiQuery().atomicQueries()[0].canRun = () => true;
            question.multiQuery().atomicQueries()[1].canRun = () => true;
            expect(question.canRun()).toBe(true);
        });
    });
});
