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
    INITIALIZE_QB,
    QUERY_COMPLETED,
    QUERY_ERRORED,
    RUN_QUERY,
    CANCEL_QUERY,
    SET_DATASET_QUERY,
    setQueryDatabase,
    setQuerySourceTable
} from "metabase/query_builder/actions";
import { SET_ERROR_PAGE } from "metabase/redux/app";

import QueryHeader from "metabase/query_builder/components/QueryHeader";
import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";
import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";
import FieldList from "metabase/query_builder/components/FieldList";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import VisualizationError from "metabase/query_builder/components/VisualizationError";

import CheckBox from "metabase/components/CheckBox";
import FilterWidget from "metabase/query_builder/components/filters/FilterWidget";
import FieldName from "metabase/query_builder/components/FieldName";
import RunButton from "metabase/query_builder/components/RunButton";

import VisualizationSettings from "metabase/query_builder/components/VisualizationSettings";
import Visualization from "metabase/visualizations/components/Visualization";
import TableSimple from "metabase/visualizations/components/TableSimple";


import {
    ORDERS_TOTAL_FIELD_ID,
    unsavedOrderCountQuestion
} from "metabase/__support__/sample_dataset_fixture";

const initQBWithReviewsTable = async () => {
    const store = await createTestStore()
    store.pushPath("/question");
    const qb = mount(store.connectContainer(<QueryBuilder />));
    await store.waitForActions([INITIALIZE_QB]);

    // Use Products table
    store.dispatch(setQueryDatabase(1));
    store.dispatch(setQuerySourceTable(4));
    await store.waitForActions([FETCH_TABLE_METADATA]);
    store.resetDispatchedActions();

    return { store, qb }
}


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

    describe("visualization settings", () => {
        it("lets you hide a field for a raw data table", async () => {
            const { store, qb } = await initQBWithReviewsTable();

            // Run the raw data query
            qb.find(RunButton).simulate("click");
            await store.waitForActions([QUERY_COMPLETED]);

            const vizSettings = qb.find(VisualizationSettings);
            vizSettings.find(".Icon-gear").simulate("click");

            const settingsModal = vizSettings.find(".test-modal")
            const table = settingsModal.find(TableSimple);

            expect(table.find('div[children="Created At"]').length).toBe(1);

            const doneButton = settingsModal.find(".Button--primary.disabled")
            expect(doneButton.length).toBe(1)

            const fieldsToIncludeCheckboxes = settingsModal.find(CheckBox)
            expect(fieldsToIncludeCheckboxes.length).toBe(8)

            fieldsToIncludeCheckboxes.at(3).simulate("click");

            expect(table.find('div[children="Created At"]').length).toBe(0);

            // Save the settings
            doneButton.simulate("click");
            expect(vizSettings.find(".test-modal").length).toBe(0);

            // Don't test the contents of actual table visualization here as react-virtualized doesn't seem to work
            // very well together with Enzyme
        })
    })

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

    describe("editor bar", async() => {
        fdescribe("for Category field in Products table", () =>  {
            // TODO: Update the test H2 database fixture so that it recognizes Category field as Category
            // and has run a database sync so that Category field contains the expected field values

            let store = null;
            let qb = null;
            beforeAll(async () => {
                ({ store, qb } = await initQBWithReviewsTable());
            })

            // NOTE: Sequential tests; these may fail in a cascading way but shouldn't affect other tests

            it("lets you add it as a filter", async () => {
                // TODO Atte Keinänen 7/13/17: Extracting GuiQueryEditor's contents to smaller React components
                // would make testing with selectors more natural
                const filterSection = qb.find('.GuiBuilder-filtered-by');
                const addFilterButton = filterSection.find('.AddButton');
                addFilterButton.simulate("click");

                const filterPopover = filterSection.find(FilterPopover);

                const ratingFieldButton = filterPopover.find(FieldList).find('h4[children="Rating"]')
                expect(ratingFieldButton.length).toBe(1);
                ratingFieldButton.simulate('click');
            })

            it("lets you see its field values in filter popover", () => {
                // Same as before applies to FilterPopover too: individual list items could be in their own components
                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                expect(fieldItems.length).toBe(5);

                // should be in alphabetical order
                expect(fieldItems.first().text()).toBe("1")
                expect(fieldItems.last().text()).toBe("5")
            })

            it("lets you set 'Rating is 5' filter", async () => {
                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                const widgetFieldItem = fieldItems.last();
                const widgetCheckbox = widgetFieldItem.find(CheckBox);

                expect(widgetCheckbox.props().checked).toBe(false);
                widgetFieldItem.children().first().simulate("click");
                expect(widgetCheckbox.props().checked).toBe(true);

                const addFilterButton = filterPopover.find('button[children="Add filter"]')
                addFilterButton.simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])
                store.resetDispatchedActions();

                expect(qb.find(FilterPopover).length).toBe(0);
                const filterWidget = qb.find(FilterWidget);
                expect(filterWidget.length).toBe(1);
                expect(filterWidget.text()).toBe("Rating is equal to5");
            })

            it("lets you set 'Rating is 5 or 4' filter", async () => {
                // reopen the filter popover by clicking filter widget
                const filterWidget = qb.find(FilterWidget);
                filterWidget.find(FieldName).simulate('click');

                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                const widgetFieldItem = fieldItems.at(3);
                const gadgetCheckbox = widgetFieldItem.find(CheckBox);

                expect(gadgetCheckbox.props().checked).toBe(false);
                widgetFieldItem.children().first().simulate("click");
                expect(gadgetCheckbox.props().checked).toBe(true);

                const addFilterButton = filterPopover.find('button[children="Update filter"]')
                addFilterButton.simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])

                expect(qb.find(FilterPopover).length).toBe(0);
                expect(filterWidget.text()).toBe("Rating is equal to2 selections");
            })

            it("lets you remove the added filter", async () => {
                const filterWidget = qb.find(FilterWidget);
                filterWidget.find(".Icon-close").simulate('click');
                await store.waitForActions([SET_DATASET_QUERY])

                expect(qb.find(FilterWidget).length).toBe(0);
            })
        })
    })
});
