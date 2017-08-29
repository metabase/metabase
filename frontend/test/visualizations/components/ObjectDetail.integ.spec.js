import {
    login,
    createSavedQuestion,
    createTestStore
} from "__support__/integrated_tests";

import {
    click
} from "__support__/enzyme_utils"

import { mount } from 'enzyme'

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

            const previousObjectTrigger = app.find('.Icon.Icon-backArrow')
            click(previousObjectTrigger)

            await store.waitForActions([QUERY_COMPLETED]);

            expect(app.find('.ObjectDetail h1').text()).toEqual("1")
            const nextObjectTrigger = app.find('.Icon.Icon-forwardArrow')
            click(nextObjectTrigger)

            await store.waitForActions([QUERY_COMPLETED]);

            expect(app.find('.ObjectDetail h1').text()).toEqual("2")
        })
    })
})
