import {
    login,
    createTestStore
} from "__support__/integrated_tests";

import React from 'react';
import { mount } from "enzyme";

import {
    INITIALIZE_QB, LOAD_TABLE_METADATA, QUERY_COMPLETED, setQuerySourceTable,
    TOGGLE_DATA_REFERENCE
} from "metabase/query_builder/actions";
import { delay } from "metabase/lib/promise"

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { orders_past_30_days_segment } from "__support__/sample_dataset_fixture";
import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";
import QueryDefinition from "metabase/query_builder/components/dataref/QueryDefinition";
import QueryButton from "metabase/components/QueryButton";
import Scalar from "metabase/visualizations/visualizations/Scalar";
import Table from "metabase/visualizations/visualizations/Table";
import UseForButton from "metabase/query_builder/components/dataref/UseForButton";
import { SegmentApi } from "metabase/services";

// Currently a lot of duplication with SegmentPane tests
describe("SegmentPane", () => {
    let store = null;
    let queryBuilder = null;
    let segment = null;

    beforeAll(async () => {
        await login();
        segment = await SegmentApi.create(orders_past_30_days_segment);
        store = await createTestStore()

        store.pushPath("/question");
        queryBuilder = mount(store.connectContainer(<QueryBuilder />));
        await store.waitForActions([INITIALIZE_QB]);
    })

    afterAll(async() => {
        await SegmentApi.delete({
            segmentId: segment.id,
            revision_message: "Please"
        });
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

        store.resetDispatchedActions() // make sure that we wait for the newest actions
        dataReference.find(`a[children="${orders_past_30_days_segment.name}"]`).first().simulate("click")

        await store.waitForActions([FETCH_TABLE_METADATA]);
    });

    it("shows you the correct segment definition", () => {
        const queryDefinition = queryBuilder.find(DataReference).find(QueryDefinition);
        // eslint-disable-next-line no-irregular-whitespace
        expect(queryDefinition.text()).toMatch(/Created At -30day/);
    })

    it("lets you apply the filter to your current query", async () => {
        await store.dispatch(setQuerySourceTable(1))
        await store.waitForActions(LOAD_TABLE_METADATA);

        const filterByButton = queryBuilder.find(DataReference).find(UseForButton).first();
        filterByButton.children().first().simulate("click");

        await store.waitForActions([QUERY_COMPLETED]);
        store.resetDispatchedActions()

        expect(queryBuilder.find(DataReference).find(UseForButton).length).toBe(0);
    });

    it("lets you see count of rows for past 30 days", async () => {
        const numberQueryButton = queryBuilder.find(DataReference).find(QueryButton).at(0);

        try {
            numberQueryButton.children().first().simulate("click");
        } catch(e) {
            // QueryButton uses react-router Link which always throws an error if it's called without a parent Router object
            // Now we are just using the onClick handler of Link so we don't have to care about that
        }

        await store.waitForActions([QUERY_COMPLETED]);
        store.resetDispatchedActions()

        // The value changes daily which wasn't originally taken into account
        // expect(queryBuilder.find(Scalar).text()).toBe("1,236")
        expect(queryBuilder.find(Scalar).text().length).toBe(5)
    });

    it("lets you see raw data for past 30 days", async () => {
        const allQueryButton = queryBuilder.find(DataReference).find(QueryButton).at(1);

        try {
            allQueryButton.children().first().simulate("click");
        } catch(e) {
            // QueryButton uses react-router Link which always throws an error if it's called without a parent Router object
            // Now we are just using the onClick handler of Link so we don't have to care about that
        }

        await store.waitForActions([QUERY_COMPLETED]);
        store.resetDispatchedActions()

        expect(queryBuilder.find(Table).length).toBe(1)
    });
});
