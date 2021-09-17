import React from "react";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import mock from "xhr-mock";

import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import Question from "metabase-lib/lib/Question";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_CACHING } from "metabase/plugins";

import {
  SAMPLE_DATASET,
  ORDERS,
  metadata,
} from "__support__/sample_dataset_fixture";
import { getStore } from "__support__/entities-store";

function mockCachingEnabled(enabled = true) {
  const original = MetabaseSettings.get;
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "enable-query-caching") {
      return enabled;
    }
    return original(key);
  });
}

const renderSaveQuestionModal = (question, originalQuestion) => {
  const store = getStore({ form });
  const onCreateMock = jest.fn(() => Promise.resolve());
  const onSaveMock = jest.fn(() => Promise.resolve());
  render(
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
  return { store, onSaveMock, onCreateMock };
};

const EXPECTED_SUGGESTED_NAME = "Orders, Count";

function getQuestion({
  isSaved,
  name = "Q1",
  description = "Example",
  collection_id = 12,
} = {}) {
  const extraCardParams = {};

  if (isSaved) {
    extraCardParams.id = 1; // if a card has an id, it means it's saved
    extraCardParams.name = name;
    extraCardParams.description = description;
    extraCardParams.collection_id = collection_id;
  }

  return new Question(
    {
      ...extraCardParams,
      display: "table",
      visualization_settings: {},
      dataset_query: {
        type: "query",
        database: SAMPLE_DATASET.id,
        query: {
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        },
      },
    },
    metadata,
  );
}

function getDirtyQuestion(originalQuestion) {
  const question = originalQuestion
    .query()
    .breakout(["field", ORDERS.TOTAL.id, null])
    .question();
  return question.setCard({
    ...question.card(),
    // After a saved question is edited, the ID gets removed
    // and a user can either overwrite a question or save it as a new one
    id: undefined,
  });
}

function fillForm({ name, description }) {
  if (name) {
    const input = screen.getByLabelText("Name");
    userEvent.clear(input);
    userEvent.type(input, name);
  }
  if (description) {
    const input = screen.getByLabelText("Description");
    userEvent.clear(input);
    userEvent.type(input, description);
  }
}

describe("SaveQuestionModal", () => {
  const TEST_COLLECTIONS = [
    {
      can_write: false,
      effective_ancestors: [],
      effective_location: null,
      id: "root",
      name: "Our analytics",
      parent_id: null,
    },
    {
      archived: false,
      can_write: true,
      color: "#31698A",
      description: null,
      id: 1,
      location: "/",
      name: "Bobby Tables's Personal Collection",
      namespace: null,
      personal_owner_id: 1,
      slug: "bobby_tables_s_personal_collection",
    },
  ];

  beforeEach(() => {
    mock.setup();
    mock.get("/api/collection", {
      body: JSON.stringify(TEST_COLLECTIONS),
    });
  });

  afterEach(() => {
    mock.teardown();
  });

  describe("new question", () => {
    it("should suggest a name for structured queries", () => {
      renderSaveQuestionModal(getQuestion());
      expect(screen.getByLabelText("Name")).toHaveValue(
        EXPECTED_SUGGESTED_NAME,
      );
    });

    it("should display empty description input", () => {
      renderSaveQuestionModal(getQuestion());
      expect(screen.getByLabelText("Description")).toHaveValue("");
    });

    it("should call onCreate correctly with default form values", () => {
      const question = getQuestion();
      const { onCreateMock } = renderSaveQuestionModal(question);

      userEvent.click(screen.getByText("Save"));

      expect(onCreateMock).toHaveBeenCalledTimes(1);
      expect(onCreateMock).toHaveBeenCalledWith({
        ...question.card(),
        name: EXPECTED_SUGGESTED_NAME,
        description: null,
        collection_id: undefined,
      });
    });

    it("should call onCreate correctly with edited form", () => {
      const question = getQuestion();
      const { onCreateMock } = renderSaveQuestionModal(question);

      fillForm({ name: "My favorite orders", description: "So many of them" });
      userEvent.click(screen.getByText("Save"));

      expect(onCreateMock).toHaveBeenCalledTimes(1);
      expect(onCreateMock).toHaveBeenCalledWith({
        ...question.card(),
        name: "My favorite orders",
        description: "So many of them",
        collection_id: undefined,
      });
    });

    it("shouldn't call onSave when form is submitted", () => {
      const question = getQuestion();
      const { onSaveMock } = renderSaveQuestionModal(question);

      userEvent.click(screen.getByText("Save"));

      expect(onSaveMock).not.toHaveBeenCalled();
    });

    it("shouldn't show a control to overwrite a saved question", () => {
      renderSaveQuestionModal(getQuestion());
      expect(
        screen.queryByText("Save as new question"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Replace original question, ".*"/),
      ).not.toBeInTheDocument();
    });
  });

  describe("overwriting a saved question", () => {
    it("should call onSave correctly when form is submitted", () => {
      const originalQuestion = getQuestion({ isSaved: true });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      const { onSaveMock } = renderSaveQuestionModal(
        dirtyQuestion,
        originalQuestion,
      );

      userEvent.click(screen.getByText("Save"));

      expect(onSaveMock).toHaveBeenCalledTimes(1);
      expect(onSaveMock).toHaveBeenCalledWith({
        ...dirtyQuestion.card(),
        id: originalQuestion.id(),
      });
    });

    it("should preserve original question's collection id", () => {
      const originalQuestion = getQuestion({
        isSaved: true,
        collection_id: 5,
      });
      const { onSaveMock } = renderSaveQuestionModal(
        getDirtyQuestion(originalQuestion),
        originalQuestion,
      );

      userEvent.click(screen.getByText("Save"));

      expect(onSaveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          collection_id: originalQuestion.collectionId(),
        }),
      );
    });

    it("shouldn't call onCreate when form is submitted", () => {
      const originalQuestion = getQuestion({ isSaved: true });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      const { onCreateMock } = renderSaveQuestionModal(
        dirtyQuestion,
        originalQuestion,
      );

      userEvent.click(screen.getByText("Save"));

      expect(onCreateMock).not.toHaveBeenCalled();
    });
  });

  describe("Cache TTL field", () => {
    beforeEach(() => {
      mockCachingEnabled();
    });

    const question = Question.create({
      databaseId: SAMPLE_DATASET.id,
      tableId: ORDERS.id,
      metadata,
    })
      .query()
      .aggregate(["count"])
      .question();

    describe("OSS", () => {
      it("is not shown", () => {
        renderSaveQuestionModal(question);
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });

    describe("EE", () => {
      beforeEach(() => {
        PLUGIN_CACHING.cacheTTLFormField = {
          name: "cache_ttl",
          type: "integer",
        };
      });

      afterEach(() => {
        PLUGIN_CACHING.cacheTTLFormField = null;
      });

      it("is not shown", () => {
        renderSaveQuestionModal(question);
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
