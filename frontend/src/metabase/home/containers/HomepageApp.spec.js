import {
    login,
    whenOffline,
    createTestStore
} from "metabase/__support__/integrated_tests";

import React from 'react';
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
    DATABASE_ID, ORDERS_TABLE_ID, metadata,
    ORDERS_TOTAL_FIELD_ID
} from "metabase/__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { CardApi } from "metabase/services";
import { CANCEL_QUERY, INITIALIZE_QB, QUERY_COMPLETED, QUERY_ERRORED, RUN_QUERY } from "metabase/query_builder/actions";
import QueryHeader from "metabase/query_builder/components/QueryHeader";
import VisualizationError from "metabase/query_builder/components/VisualizationError";

import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";
import Visualization from "metabase/visualizations/components/Visualization";
import RunButton from "metabase/query_builder/components/RunButton";
import { SET_ERROR_PAGE } from "metabase/redux/app";

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
