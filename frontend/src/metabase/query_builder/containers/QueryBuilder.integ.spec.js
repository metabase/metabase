import {
    login,
    createTestStore,
} from "metabase/__support__/integrated_tests";

import React from 'react';
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
    ADD_QUERY_FILTER,
    INITIALIZE_QB, QUERY_COMPLETED,
    REMOVE_QUERY_FILTER,
    setQueryDatabase,
    setQuerySourceTable,
    UPDATE_QUERY_FILTER
} from "metabase/query_builder/actions";
import QueryHeader from "metabase/query_builder/components/QueryHeader";
import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";
import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";
import FieldList from "metabase/query_builder/components/FieldList";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

import CheckBox from "metabase/components/CheckBox";
import FilterWidget from "metabase/query_builder/components/filters/FilterWidget";
import FieldName from "metabase/query_builder/components/FieldName";
import RunButton from "metabase/query_builder/components/RunButton";

import VisualizationSettings from "metabase/query_builder/components/VisualizationSettings";
import TableSimple from "metabase/visualizations/components/TableSimple";

const initQBWithProductsTable = async () => {
    const store = await createTestStore()
    store.pushPath("/question");
    const qb = mount(store.connectContainer(<QueryBuilder />));
    await store.waitForActions([INITIALIZE_QB]);

    // Use Products table
    store.dispatch(setQueryDatabase(1));
    store.dispatch(setQuerySourceTable(3));
    await store.waitForActions([FETCH_TABLE_METADATA]);

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

    describe("editor bar", async() => {
        describe("for Category field in Products table", () =>  {
            // TODO: Update the sample dataset fixture so that it recognizes Category field as Category
            // and has run a database sync so that Category field contains the expected field values

            let store = null;
            let qb = null;
            beforeAll(async () => {
                ({ store, qb } = await initQBWithProductsTable());
            })

            // NOTE: Sequential tests; these may fail in a cascading way but shouldn't affect other tests

            it("lets you add it as a filter", async () => {
                // TODO Atte Keinänen 7/13/17: Extracting GuiQueryEditor's contents to smaller React components
                // would make testing with selectors more natural
                const filterSection = qb.find('.GuiBuilder-filtered-by');
                const addFilterButton = filterSection.find('.AddButton');
                addFilterButton.simulate("click");

                const filterPopover = filterSection.find(FilterPopover);

                const categoryFieldButton = filterPopover.find(FieldList).find('h4[children="Category"]')
                expect(categoryFieldButton.length).toBe(1);
                categoryFieldButton.simulate('click');
            })

            it("lets you see its field values in filter popover", () => {
                // Same as before applies to FilterPopover too: individual list items could be in their own components
                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                expect(fieldItems.length).toBe(4);

                // should be in alphabetical order
                expect(fieldItems.first().text()).toBe("Doohickey")
                expect(fieldItems.last().text()).toBe("Widget")
            })

            it("lets you set 'Category is Widget' filter", async () => {
                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                const widgetFieldItem = fieldItems.last();
                const widgetCheckbox = widgetFieldItem.find(CheckBox);

                expect(widgetCheckbox.props().checked).toBe(false);
                widgetFieldItem.children().first().simulate("click");
                expect(widgetCheckbox.props().checked).toBe(true);

                const addFilterButton = filterPopover.find('button[children="Add filter"]')
                addFilterButton.simulate("click");

                await store.waitForActions([ADD_QUERY_FILTER])
                store.resetDispatchedActions();

                expect(qb.find(FilterPopover).length).toBe(0);
                const filterWidget = qb.find(FilterWidget);
                expect(filterWidget.length).toBe(1);
                expect(filterWidget.text()).toBe("Category isWidget");
            })

            it("lets you set 'Category is Gadget or Gizmo", async () => {
                // reopen the filter popover by clicking filter widget
                const filterWidget = qb.find(FilterWidget);
                filterWidget.find(FieldName).simulate('click');

                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                const widgetFieldItem = fieldItems.at(2);
                const gadgetCheckbox = widgetFieldItem.find(CheckBox);

                expect(gadgetCheckbox.props().checked).toBe(false);
                widgetFieldItem.children().first().simulate("click");
                expect(gadgetCheckbox.props().checked).toBe(true);

                const addFilterButton = filterPopover.find('button[children="Update filter"]')
                addFilterButton.simulate("click");

                await store.waitForActions([UPDATE_QUERY_FILTER])

                expect(qb.find(FilterPopover).length).toBe(0);
                expect(filterWidget.text()).toBe("Category is2 selections");
            })

            it("lets you remove the added filter", async () => {
                const filterWidget = qb.find(FilterWidget);
                filterWidget.find(".Icon-close").simulate('click');
                await store.waitForActions([REMOVE_QUERY_FILTER])

                expect(qb.find(FilterWidget).length).toBe(0);
            })
        })
    })

    describe("visualization settings", () => {
        it("lets you hide a field for a raw data table", async () => {
            const { store, qb } = await initQBWithProductsTable();

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

    describe("raw data visuaization")
    describe("for Orders table with remapped fields", () => {
        it("should be ")
        pending();
    });
});
