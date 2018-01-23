import {
    useSharedAdminLogin,
    createTestStore
} from "__support__/integrated_tests";

import React from 'react';
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
    INITIALIZE_QB,
    QUERY_COMPLETED,
} from "metabase/query_builder/actions";

import QueryHeader from "metabase/query_builder/components/QueryHeader";

import Visualization from "metabase/visualizations/components/Visualization";

import Question from "metabase-lib/lib/Question";
import { getCard } from "metabase/query_builder/selectors";

const timeBreakoutQuestion = Question.create({databaseId: 1, tableId: 1, metadata: null})
    .query()
    .addAggregation(["count"])
    .addBreakout(["datetime-field", ["field-id", 1], "day"])
    .question()
    .setDisplay("line")
    .setDisplayName("Time breakout question")

describe("Query Builder visualization logic", () => {
    beforeAll(async () => {
        useSharedAdminLogin()
    })

    it("should save the default x axis and y axis to `visualization_settings` on query completion", async () => {
        const store = await createTestStore()
        store.pushPath(timeBreakoutQuestion.getUrl());
        const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
        await store.waitForActions([INITIALIZE_QB]);

        expect(getCard(store.getState()).visualization_settings).toEqual({})

        await store.waitForActions([QUERY_COMPLETED]);

        expect(getCard(store.getState()).visualization_settings).toEqual({
            "graph.dimensions": ["CREATED_AT"],
            "graph.metrics": ["count"]
        })
    });
});
