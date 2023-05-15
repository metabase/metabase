import React from "react";
import fetchMock from "fetch-mock";

import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";

import { createMockUser } from "metabase-types/api/mocks";

import Question from "metabase-lib/Question";

import { QuestionInfoSidebar } from "./QuestionInfoSidebar";

// eslint-disable-next-line react/display-name, react/prop-types
jest.mock("metabase/core/components/Link", () => ({ to, ...props }) => (
  <a {...props} href={to} />
));

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
  moderation_reviews: [
    {
      status: "verified",
      moderator_id: 1,
      created_at: Date.now(),
      most_recent: true,
    },
  ],
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

async function setup({ question, cachingEnabled = true } = {}) {
  const user = createMockUser();

  const settings = mockSettings({
    "enable-query-caching": cachingEnabled,
    "query-caching-min-ttl": 10000,
  });

  const id = question.id();
  fetchMock
    .get(`path:/api/card/${id}`, question.card())
    .get({ url: `path:/api/revision`, query: { entity: "card", id } }, [])
    .get("path:/api/user", [user])
    .get(`path:/api/user/${user.id}`, user);

  const onSave = jest.fn();

  renderWithProviders(
    <QuestionInfoSidebar question={question} onSave={onSave} />,
    {
      withSampleDatabase: true,
      storeInitialState: {
        settings: settings,
        currentUser: user,
      },
    },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));
}

describe("QuestionInfoSidebar", () => {
  describe("common features", () => {
    [
      { type: "Saved Question", getObject: getQuestion },
      { type: "Dataset", getObject: getDataset },
    ].forEach(testCase => {
      const { type, getObject } = testCase;

      describe(type, () => {
        it("displays description", async () => {
          await setup({ question: getObject({ description: "Foo bar" }) });
          expect(screen.getByText("Foo bar")).toBeInTheDocument();
        });
      });
    });
  });

  describe("cache ttl field", () => {
    describe("oss", () => {
      it("is not shown", async () => {
        await setup({ question: getQuestion() });
        expect(
          screen.queryByText("Cache Configuration"),
        ).not.toBeInTheDocument();
      });
    });

    describe("ee", () => {
      beforeEach(() => {
        setupEnterpriseTest();
      });

      it("is shown if caching is enabled", async () => {
        await setup({ question: getQuestion({ cache_ttl: 2 }) });
        expect(screen.getByText("Cache Configuration")).toBeInTheDocument();
      });

      it("is hidden if caching is disabled", async () => {
        await setup({ question: getQuestion(), cachingEnabled: false });
        expect(
          screen.queryByText("Cache Configuration"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("moderation field", () => {
    beforeEach(() => {
      setupEnterpriseTest();
    });

    it("should not show verification badge if unverified", async () => {
      await setup({ question: getQuestion({ moderation_reviews: [] }) });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });

    it("should show verification badge if verified", async () => {
      await setup({ question: getQuestion() });
      expect(screen.getByText(/verified this/)).toBeInTheDocument();
    });
  });

  describe("model detail link", () => {
    it("is shown for models", async () => {
      const model = getDataset();
      await setup({ question: model });

      const link = screen.getByText("Model details");

      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", `${model.getUrl()}/detail`);
    });

    it("isn't shown for questions", async () => {
      await setup({ question: getQuestion() });
      expect(screen.queryByText("Model details")).not.toBeInTheDocument();
    });
  });

  describe("read-only permissions", () => {
    it("should disable input field for description", async () => {
      await setup({
        question: getQuestion({ description: "Foo bar", can_write: false }),
      });
      // show input
      userEvent.click(screen.getByTestId("editable-text"));

      expect(screen.queryByPlaceholderText("Add description")).toHaveValue(
        "Foo bar",
      );
      expect(screen.queryByPlaceholderText("Add description")).toBeDisabled();
    });

    it("should display 'No description' if description is null and user does not have write permissions", async () => {
      await setup({
        question: getQuestion({ description: null, can_write: false }),
      });
      expect(screen.getByPlaceholderText("No description")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("No description")).toBeDisabled();
    });
  });
});
