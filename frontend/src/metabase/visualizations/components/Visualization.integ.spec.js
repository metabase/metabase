import React from 'react';
import { mount, shallow } from 'enzyme';
import Visualization from "metabase/visualizations/components/Visualization";

import { initializeQB, navigateToNewCardInsideQB } from "metabase/query_builder/actions";
import { parse as urlParse } from "url";

import {
    linkContainerToGlobalReduxStore,
    login,
    startServer,
    stopServer,
    globalReduxStore as store,
    globalBrowserHistory as history
} from "metabase/__support__/integrated_tests";

import Question from "metabase-lib/lib/Question";
import {
    DATABASE_ID,
    ORDERS_TABLE_ID,
    metadata,
} from "metabase/__support__/sample_dataset_fixture";
import ChartClickActions from "metabase/visualizations/components/ChartClickActions";

const getVisualization = (question, results, onChangeCardAndRun) =>
    linkContainerToGlobalReduxStore(
        <Visualization
            series={[{card: question.card(), data: results[0].data}]}
            onChangeCardAndRun={navigateToNewCardInsideQB}
            metadata={metadata}
        />
    );

const question = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
    .query()
    .addAggregation(["count"])
    .question()

describe('Visualization', () => {
    beforeAll(async () => {
        await startServer();
        await login();
    });

    afterAll(async () => {
        await stopServer();
    });

    // see docstring of navigateToNewCardInsideQB for all possible scenarios
    describe("drill-through action inside query builder", () => {
        describe("for an unsaved question", () => {
            pending();
            it("results in a correct url", async () => {

                // NON-TESTED CODE FOLLOWS, JUST DOCUMENTING THE IDEA

                // initialize the query builder state
                // (we are intentionally simplifying things by not rendering the QB but just focusing the redux state instead)
                await store.dispatch(initializeQB(urlParse(question.getUrl()), {}))

                const results = await question.getResults();
                const viz = shallow(getVisualization(question, results, navigateToNewCardInsideQB));
                const clickActions = viz.find(ChartClickActions).dive();

                const action = {} // gets some real mode action here
                // we should make handleClickAction async so that we know when navigateToNewCardInsideQB is ready
                // (that actually only applies to the saved card scenario)
                await clickActions.instance().handleClickAction(action)
                expect(history.getCurrentLocation().hash).toBe("this-value-is-fixed")
            })

            it("shows the lineage correctly", () => {
                // requires writing a new selector for QB
                const getLineage = (store) => {}
                expect(getLineage(store.getState())).toBe("some value")
            })

            it("results in correct query result", () => {
            })
        })

        describe("for a clean saved question", () => {
            pending();

            it("results in a correct url", async () => {
            })
            it("shows the lineage correctly", () => {
            })
            it("results in correct query result", () => {
            })
        })

        describe("for a dirty saved question", () => {
            pending();
            
            it("results in a correct url", () => {
            })
            it("shows the lineage correctly", () => {
            })
            it("results in correct query result", () => {
            })
        })
    })

});
