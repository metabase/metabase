import {
    login,
    createTestStore
} from "__support__/integrated_tests";

import React from 'react';
import { mount } from "enzyme";

import {
    INITIALIZE_QB, QUERY_COMPLETED, setQuerySourceTable,
    TOGGLE_DATA_REFERENCE
} from "metabase/query_builder/actions";
import { delay } from "metabase/lib/promise"

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";
import QueryButton from "metabase/components/QueryButton";
import Table from "metabase/visualizations/visualizations/Table";
import UseForButton from "metabase/query_builder/components/dataref/UseForButton";

// Currently a lot of duplication with FieldPane tests
describe("FieldPane", () => {
    let store = null;
    let queryBuilder = null;

    beforeAll(async () => {
        await login();
        store = await createTestStore()

        store.pushPath("/question");
        queryBuilder = mount(store.connectContainer(<QueryBuilder />));
        await store.waitForActions([INITIALIZE_QB]);
    })

    // NOTE: These test cases are intentionally stateful
    // (doing the whole app rendering thing in every single test case would probably slow things down)

    it("opens properly from QB", async () => {
        // open data reference sidebar by clicking button
        queryBuilder.find(".Icon-reference").simulate("click");
        await store.waitForActions([TOGGLE_DATA_REFERENCE]);

        const dataReference = queryBuilder.find(DataReference);
        expect(dataReference.length).toBe(1);

        dataReference.find('a[children="Orders"]').simulate("click");

        // TODO: Refactor TablePane so that it uses redux/metadata actions instead of doing inlined API calls
        // then we can replace this with `store.waitForActions([FETCH_TABLE_FOREIGN_KEYS])` or similar
        await delay(3000)

        dataReference.find(`a[children="Created At"]`).first().simulate("click")

        await store.waitForActions([FETCH_TABLE_METADATA]);
    });

    it("lets you group by Created At", async () => {
        const getUseForButton = () => queryBuilder.find(DataReference).find(UseForButton);

        expect(getUseForButton().length).toBe(0);

        await store.dispatch(setQuerySourceTable(1))
        // eslint-disable-line react/no-irregular-whitespace
        expect(getUseForButton().text()).toMatch(/Group by/);

        getUseForButton().simulate('click');
        await store.waitForActions([QUERY_COMPLETED]);
        store.resetDispatchedActions()

        // after the breakout has been applied, the button shouldn't be visible anymore
        expect(getUseForButton().length).toBe(0);
    })

    it("lets you see all distinct values of Created At", async () => {
        const distinctValuesButton = queryBuilder.find(DataReference).find(QueryButton).at(0);

        try {
            distinctValuesButton.children().first().simulate("click");
        } catch(e) {
            // QueryButton uses react-router Link which always throws an error if it's called without a parent Router object
            // Now we are just using the onClick handler of Link so we don't have to care about that
        }

        await store.waitForActions([QUERY_COMPLETED]);
        store.resetDispatchedActions()

        expect(queryBuilder.find(Table).length).toBe(1)
    });
});
