import React from "react";
import { mount } from "enzyme";

import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import Question from "metabase-lib/lib/Question";

import {
  SAMPLE_DATASET,
  ORDERS,
  PEOPLE,
  metadata,
} from "__support__/sample_dataset_fixture";

import { createStore, combineReducers } from "redux";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";

const mountSaveQuestionModal = (question, originalQuestion) => {
  const store = createStore(combineReducers({ form }));
  const onCreateMock = jest.fn(() => Promise.resolve());
  const onSaveMock = jest.fn(() => Promise.resolve());
  const component = mount(
    <Provider store={store}>
      <SaveQuestionModal
        card={question.card()}
        originalCard={originalQuestion && originalQuestion.card()}
        tableMetadata={question.table()}
        onCreate={onCreateMock}
        onSave={onSaveMock}
        onClose={() => {}}
      />
    </Provider>,
  );
  return { store, component, onSaveMock, onCreateMock };
};

describe("SaveQuestionModal", () => {
  it("should call onCreate correctly for a new question", async () => {
    const newQuestion = Question.create({
      databaseId: SAMPLE_DATASET.id,
      tableId: ORDERS.id,
      metadata,
    })
      .query()
      .aggregate(["count"])
      .question();

    // Use the count aggregation as an example case (this is equally valid for filters and groupings)
    const { component, onCreateMock } = mountSaveQuestionModal(
      newQuestion,
      null,
    );
    component.find("button[type='submit']").simulate("click");
    expect(onCreateMock.mock.calls).toHaveLength(1);
  });
  it("should call onSave correctly for a dirty, saved question", async () => {
    const originalQuestion = Question.create({
      databaseId: SAMPLE_DATASET.id,
      tableId: ORDERS.id,
      metadata,
    })
      .query()
      .aggregate(["count"])
      .question();
    // "Save" the question
    originalQuestion.card.id = 5;

    const dirtyQuestion = originalQuestion
      .query()
      .breakout(["field-id", ORDERS.TOTAL.id])
      .question();

    // Use the count aggregation as an example case (this is equally valid for filters and groupings)
    const { component, onSaveMock } = mountSaveQuestionModal(
      dirtyQuestion,
      originalQuestion,
    );
    component.find("button[type='submit']").simulate("click");
    expect(onSaveMock.mock.calls.length).toBe(1);
  });

  it("should preserve the collection_id of a question in overwrite mode", async () => {
    let originalQuestion = Question.create({
      databaseId: SAMPLE_DATASET.id,
      tableId: PEOPLE.id,
      metadata,
    })
      .query()
      .aggregate(["count"])
      .question();

    // set the collection_id of the original question
    originalQuestion = originalQuestion.setCard({
      ...originalQuestion.card(),
      collection_id: 5,
    });

    const dirtyQuestion = originalQuestion
      .query()
      .breakout(["field-id", ORDERS.TOTAL.id])
      .question();

    const { component, onSaveMock } = mountSaveQuestionModal(
      dirtyQuestion,
      originalQuestion,
    );
    component.find("button[type='submit']").simulate("click");
    expect(onSaveMock.mock.calls[0][0].collection_id).toEqual(5);
  });
});
