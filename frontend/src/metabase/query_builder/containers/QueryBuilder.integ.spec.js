import {
    login,
    createTestStore,
} from "metabase/__support__/integrated_tests";

import React from 'react';
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import { INITIALIZE_QB } from "metabase/query_builder/actions";
import QueryHeader from "metabase/query_builder/components/QueryHeader";
import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";

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
});
