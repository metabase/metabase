import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import Question from "metabase-lib/lib/Question";
import QuestionDetailsSidebarPanel from "./QuestionDetailsSidebarPanel";

const BASE_QUESTION = {
  id: 1,
  name: "Q1",
  description: null,
  collection_id: null,
  can_write: true,
  dataset: false,
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE.id,
    query: {
      "source-table": ORDERS.id,
    },
  },
};

function getQuestion(card) {
  return new Question(
    {
      ...BASE_QUESTION,
      ...card,
    },
    metadata,
  );
}

function getDataset(card) {
  return new Question(
    {
      ...BASE_QUESTION,
      ...card,
      dataset: true,
    },
    metadata,
  );
}

function setup({ question } = {}) {
  const onOpenModal = jest.fn();

  const settingsState = {
    values: { "enable-nested-queries": true },
  };

  renderWithProviders(
    <QuestionDetailsSidebarPanel
      question={question}
      onOpenModal={onOpenModal}
    />,
    {
      withSampleDatabase: true,
      storeInitialState: {
        settings: settingsState,
      },
      reducers: {
        settings: () => settingsState,
      },
    },
  );

  return { onOpenModal };
}

describe("QuestionDetailsSidebarPanel", () => {
  describe("common features", () => {
    [
      { type: "Saved Question", getObject: getQuestion },
      { type: "Dataset", getObject: getDataset },
    ].forEach(testCase => {
      const { type, getObject } = testCase;

      describe(type, () => {
        it("displays description", () => {
          setup({ question: getObject({ description: "Foo bar" }) });
          expect(screen.queryByText("Foo bar")).toBeInTheDocument();
        });
      });
    });
  });
});
