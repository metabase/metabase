import {
    login,
    whenOffline,
    createSavedQuestion,
    createTestStore,
} from "metabase/__support__/integrated_tests";

import React from 'react';
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
    ORDERS_TOTAL_FIELD_ID,
    unsavedOrderCountQuestion
} from "metabase/__support__/sample_dataset_fixture";
import { CANCEL_QUERY, INITIALIZE_QB, QUERY_COMPLETED, QUERY_ERRORED, RUN_QUERY } from "metabase/query_builder/actions";
import VisualizationError from "metabase/query_builder/components/VisualizationError";

import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";
import Visualization from "metabase/visualizations/components/Visualization";
import RunButton from "metabase/query_builder/components/RunButton";
import { SET_ERROR_PAGE } from "metabase/redux/app";
import QueryHeader from "metabase/query_builder/components/QueryHeader";

describe("QueryBuilder", () => {
    beforeAll(async () => {
        await login()
    })

    /**
     * Simple tests for seeing if the query builder renders without errors
     */
    describe("for new questions", async () => {
        it("renders normally on page load", async () => {
            const store = await createTestStore()

            store.pushPath("/question");
            const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
            await store.waitForActions([INITIALIZE_QB]);

            expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
            expect(qbWrapper.find(VisualizationEmptyState).length).toBe(1)
        });
    });

    describe("for saved questions", async () => {
        let savedQuestion = null;
        beforeAll(async () => {
            savedQuestion = await createSavedQuestion(unsavedOrderCountQuestion)
        })

        it("renders normally on page load", async () => {
            const store = await createTestStore()
            store.pushPath(savedQuestion.getUrl(savedQuestion));
            const qbWrapper = mount(store.connectContainer(<QueryBuilder />));

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
            expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe(savedQuestion.displayName())
        });
        it("shows an error page if the server is offline", async () => {
            const store = await createTestStore()

            await whenOffline(async () => {
                store.pushPath(savedQuestion.getUrl());
                mount(store.connectContainer(<QueryBuilder />));
                // only test here that the error page action is dispatched
                // (it is set on the root level of application React tree)
                await store.waitForActions([INITIALIZE_QB, SET_ERROR_PAGE]);
            })
        })
        it("doesn't execute the query if user cancels it", async () => {
            const store = await createTestStore()
            store.pushPath(savedQuestion.getUrl());
            const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
            await store.waitForActions([INITIALIZE_QB, RUN_QUERY]);

            const runButton = qbWrapper.find(RunButton);
            expect(runButton.text()).toBe("Cancel");
            expect(runButton.simulate("click"));

            await store.waitForActions([CANCEL_QUERY, QUERY_ERRORED]);
            expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe(savedQuestion.displayName())
            expect(qbWrapper.find(VisualizationEmptyState).length).toBe(1)
        })
    });


    describe("for dirty questions", async () => {
        describe("without original saved question", () => {
            it("renders normally on page load", async () => {
                const store = await createTestStore()
                store.pushPath(unsavedOrderCountQuestion.getUrl());
                const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

                expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
                expect(qbWrapper.find(Visualization).length).toBe(1)
            });
            it("fails with a proper error message if the query is invalid", async () => {
                const invalidQuestion = unsavedOrderCountQuestion.query()
                    .addBreakout(["datetime-field", ["field-id", 12345], "day"])
                    .question();

                const store = await createTestStore()
                store.pushPath(invalidQuestion.getUrl());
                const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

                // TODO: How to get rid of the delay? There is asynchronous initialization in some of VisualizationError parent components
                // Making the delay shorter causes Jest test runner to crash, see https://stackoverflow.com/a/44075568
                expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
                expect(qbWrapper.find(VisualizationError).length).toBe(1)
                expect(qbWrapper.find(VisualizationError).text().includes("There was a problem with your question")).toBe(true)
            });
            it("fails with a proper error message if the server is offline", async () => {
                const store = await createTestStore()

                await whenOffline(async () => {
                    store.pushPath(unsavedOrderCountQuestion.getUrl());
                    const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                    await store.waitForActions([INITIALIZE_QB, QUERY_ERRORED]);

                    expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
                    expect(qbWrapper.find(VisualizationError).length).toBe(1)
                    expect(qbWrapper.find(VisualizationError).text().includes("We're experiencing server issues")).toBe(true)
                })
            })
            it("doesn't execute the query if user cancels it", async () => {
                const store = await createTestStore()
                store.pushPath(unsavedOrderCountQuestion.getUrl());
                const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                await store.waitForActions([INITIALIZE_QB, RUN_QUERY]);

                const runButton = qbWrapper.find(RunButton);
                expect(runButton.text()).toBe("Cancel");
                expect(runButton.simulate("click"));

                await store.waitForActions([CANCEL_QUERY, QUERY_ERRORED]);
                expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
                expect(qbWrapper.find(VisualizationEmptyState).length).toBe(1)
            })
        })
        describe("with original saved question", () => {
            it("should render normally on page load", async () => {
                const store = await createTestStore()
                const savedQuestion = await createSavedQuestion(unsavedOrderCountQuestion);

                const dirtyQuestion = savedQuestion
                    .query()
                    .addBreakout(["field-id", ORDERS_TOTAL_FIELD_ID])
                    .question()

                store.pushPath(dirtyQuestion.getUrl(savedQuestion));
                const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

                const title = qbWrapper.find(QueryHeader).find("h1")
                expect(title.text()).toBe("New question")
                expect(title.parent().children().at(1).text()).toBe(`started from ${savedQuestion.displayName()}`)
            });
        });
    });
});
