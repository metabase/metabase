import {
    login,
    globalReduxStore as store,
    linkContainerToGlobalReduxStore
} from "metabase/__support__/integrated_tests";

import React from 'react';
import { parse as urlParse } from "url";
import { initializeQB } from "../actions";
import { refreshSiteSettings } from "metabase/redux/settings";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import { DATABASE_ID, ORDERS_TABLE_ID, metadata } from "metabase/__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { CardApi } from "metabase/services";

// TODO Atte Keinänen 6/22/17: Write functional mock implementations of Modal and Tooltip
// We can't use the original classes because they do DOM mutation

jest.mock("metabase/components/Modal", () => {
    return (children) => <div className="mocked-modal" />
});

jest.mock("metabase/components/Tooltip", () => {
    return (children) => <div className="mocked-tooltip" />
});

const getQBContainer = (cardId) =>
    linkContainerToGlobalReduxStore(<QueryBuilder params={cardId ? { cardId } : {}} location={{ query: {} }}/>)

const createSavedQuestion = async () => {
    let unsavedQuestion = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
        .query()
        .addAggregation(["count"])
        .question()

    unsavedQuestion._card = { ...unsavedQuestion._card, name: "Order count" }

    const savedCard = await CardApi.create(unsavedQuestion.card())
    return unsavedQuestion.setCard(savedCard);
}

describe("QueryBuilder", () => {
    beforeAll(async () => {
        await login();
    })

    /**
     * Simple tests for seeing if the query builder renders without errors
     */

    describe("for new questions", async () => {
        it("should render normally on page load", async () => {
            const location = urlParse("/question")
            await store.dispatch(refreshSiteSettings());
            await store.dispatch(initializeQB(location, {}))

            // If mount completes without errors, the test will pass
            mount(getQBContainer());
        });
    });

    describe("for saved questions", async () => {
        it("should render normally on page load", async () => {
            const question = await createSavedQuestion()
            const location = urlParse(`/question/${question.id()}`)
            await store.dispatch(initializeQB(location, {cardId: question.id()}))

            // If mount completes without errors, the test will pass
            mount(getQBContainer(question.id()));
        });
    });
});
