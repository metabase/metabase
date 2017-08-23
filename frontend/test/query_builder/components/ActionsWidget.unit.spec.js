import React from 'react'
import { shallow } from 'enzyme'

import ActionsWidget from '../../../src/metabase/query_builder/components/ActionsWidget';
import Question from "metabase-lib/lib/Question";
import {
    DATABASE_ID,
    ORDERS_TABLE_ID,
    metadata
} from "__support__/sample_dataset_fixture";

const getActionsWidget = (question) =>
    <ActionsWidget
        question={question}
        card={question.card()}
        setCardAndRun={() => {}}
        navigateToNewCardInsideQB={() => {}}
    />

describe('ActionsWidget', () => {
    describe("visibility", () => {
        it("is visible for an empty question", () => {
            const question: Question = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
                .query()
                .question();

            const component = shallow(getActionsWidget(question));
            expect(component.children().children().length).toBeGreaterThan(0);
        });
    })

    describe("clicking an action", () => {
        pending();
        // will require changing this to an integrated test
        // see Visualization.integ.spec.js for similar tests for visualization drill-through

        it("results in correct url", async () => {
            // await initializeQB();
        })
        it("results in correct question name and lineage", async () => {
        })
        it("results in the correct query result", async () => {
        })
    })
});