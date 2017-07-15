import React from 'react'
import { shallow } from 'enzyme'

import SaveQuestionModal from './SaveQuestionModal';
import Question from "metabase-lib/lib/Question";
import {
    DATABASE_ID,
    ORDERS_TABLE_ID,
    metadata, ORDERS_TOTAL_FIELD_ID
} from "metabase/__support__/sample_dataset_fixture";

const createFnMock = jest.fn();
const saveFnMock = jest.fn();

const getSaveQuestionModal = (question, originalQuestion) => <SaveQuestionModal
    card={question.card()}
    originalCard={originalQuestion && originalQuestion.card()}
    tableMetadata={question.tableMetadata()}
    createFn={createFnMock}
    saveFn={saveFnMock}
    onClose={() => {}}
/>

describe('SaveQuestionModal', () => {
    it("should call createFn correctly for a new question", async () => {
        const newQuestion = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
            .query()
            .addAggregation(["count"])
            .question()

        // Use the count aggregation as an example case (this is equally valid for filters and groupings)
        const component = shallow(getSaveQuestionModal(newQuestion, null));
        await component.instance().formSubmitted();
        expect(createFnMock.mock.calls.length).toBe(1);

    });
    it("should call saveFn correctly for a dirty, saved question", async () => {
        const originalQuestion = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
            .query()
            .addAggregation(["count"])
            .question()
        // "Save" the question
        originalQuestion.card.id = 5;

        const dirtyQuestion = originalQuestion
            .query()
            .addBreakout(["field-id", ORDERS_TOTAL_FIELD_ID])
            .question()

        // Use the count aggregation as an example case (this is equally valid for filters and groupings)
        const component = shallow(getSaveQuestionModal(dirtyQuestion, originalQuestion));
        await component.instance().formSubmitted();
        expect(saveFnMock.mock.calls.length).toBe(1);
    });
});