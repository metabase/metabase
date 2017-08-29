import {
    login,
    createSavedQuestion,
    createTestStore
} from "__support__/integrated_tests";

import {
    click,
    clickButton, setInputValue
} from "__support__/enzyme_utils"

import React from 'react';
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from 'enzyme'

import {
    unsavedOrderCountQuestion
} from "__support__/sample_dataset_fixture";

import {
    INITIALIZE_QB,
    QUERY_COMPLETED,
} from "metabase/query_builder/actions";

import Question from "metabase-lib/lib/Question"

import { getMetadata } from "metabase/selectors/metadata";

describe('ObjectDetail', () => {

    beforeAll(async () => {
        await login()
    })

    describe('Increment and Decrement', () => {
        it('should properly increment and decrement object deteail', async () => {
            const store = await createTestStore()
            const newQuestion = Question.create({databaseId: 1, tableId: 1, metadata: getMetadata(store.getState())})
                .query()
                .addFilter(["=", ["field-id", 2], 2])
                .question()
                .setDisplayName('Object Detail')

            const savedQuestion = await createSavedQuestion(newQuestion);

            store.pushPath(savedQuestion.getUrl());

            const app = mount(store.getAppContainer());

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

            expect(app.find('.ObjectDetail h1').text()).toEqual("2")

            const previousObjectTrigger = app.find('.Icon.Icon-chevronleft')
            click(previousObjectTrigger)

            await store.waitForActions([QUERY_COMPLETED]);

            expect(app.find('.ObjectDetail h1').text()).toEqual("1")
            const nextObjectTrigger = app.find('.Icon.Icon-chevronright')
            click(nextObjectTrigger)

            await store.waitForActions([QUERY_COMPLETED]);

            expect(app.find('.ObjectDetail h1').text()).toEqual("2")
        })
    })
})
