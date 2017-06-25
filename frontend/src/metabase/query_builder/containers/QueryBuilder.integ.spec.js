import {
    login,
    globalReduxStore as store,
    linkContainerToGlobalReduxStore
} from "metabase/__support__/integrated_tests";

import React from 'react';
import { parse as urlParse } from "url";
import { refreshSiteSettings } from "metabase/redux/settings";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import { DATABASE_ID, ORDERS_TABLE_ID, metadata } from "metabase/__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { CardApi } from "metabase/services";
import { INITIALIZE_QB, QUERY_COMPLETED, QUERY_ERRORED } from "metabase/query_builder/actions";
import QueryHeader from "metabase/query_builder/components/QueryHeader";
import VisualizationError from "metabase/query_builder/components/VisualizationError";

import { delay } from 'metabase/lib/promise';

// TODO Atte Keinänen 6/22/17: Write functional mock implementations of Modal and Tooltip
// We can't use the original classes because they do DOM mutation
jest.mock("metabase/components/Modal", () => {
    const MockedModal = () => <div className="mocked-modal" />
    return MockedModal
});
jest.mock("metabase/components/Tooltip", () => {
    const MockedTooltip = () => <div className="mocked-tooltip" />
    return MockedTooltip
});

const getQBContainer = (location, cardId = null) =>
    linkContainerToGlobalReduxStore(<QueryBuilder params={cardId ? { cardId } : {}} location={{...location, query: {}}} />)

let unsavedQuestion = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
    .query()
    .addAggregation(["count"])
    .question()
unsavedQuestion._card = { ...unsavedQuestion._card, name: "Order count" }

const createSavedQuestion = async () => {
    const savedCard = await CardApi.create(unsavedQuestion.card())
    return unsavedQuestion.setCard(savedCard);
}


describe("QueryBuilder", () => {
    beforeAll(async () => {
        await login()
        await store.dispatch(refreshSiteSettings());
    })

    /**
     * Simple tests for seeing if the query builder renders without errors
     */
    describe("for new questions", async () => {
        it("renders normally on page load", async () => {
            const location = urlParse("/question")
            const qbContainer = mount(getQBContainer(location));
            await store.waitForActions([INITIALIZE_QB]);
            expect(qbContainer.find(QueryHeader).length).toBe(1)
        });
    });

    describe("for saved questions", async () => {
        it("renders normally on page load", async () => {
            const question = await createSavedQuestion()
            const location = urlParse(`/question/${question.id()}`)
            const qbContainer = mount(getQBContainer(location, question.id()));
            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
            expect(qbContainer.find(QueryHeader).length).toBe(1)
        });
    });

    describe("for dirty questions", async () => {
        describe("without original saved question", () => {
            it("should render normally on page load", async () => {
                const location = urlParse(unsavedQuestion.getUrl())
                const qbContainer = mount(getQBContainer(location));
                await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
                expect(qbContainer.find(QueryHeader).length).toBe(1)
            });
            it("fails with a proper error message if the query is invalid", async () => {
                const invalidQuestion = unsavedQuestion.query()
                    .addBreakout(["datetime-field", ["field-id", 12345], "day"])
                    .question();
                const location = urlParse(invalidQuestion.getUrl())
                const qbContainer = mount(getQBContainer(location))
                await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED], { timeout: 5000 });
                // TODO: How to get rid of the delay? There is asynchronous initialization in some of VisualizationError parent components
                // Making the delay shorter causes Jest test runner to crash, see https://stackoverflow.com/a/44075568
                await delay(1000);
                expect(qbContainer.find(VisualizationError).length).toBe(1)
                // Maybe these should be in VisualizationError test instead:
                expect(qbContainer.find(".QueryError-image").length).toBe(1)
                expect(qbContainer.find(".QueryError-image").children().length).toBeGreaterThan(0)
            });
        })
        describe("with original saved question", () => {
            pending();
        });
    });

});
