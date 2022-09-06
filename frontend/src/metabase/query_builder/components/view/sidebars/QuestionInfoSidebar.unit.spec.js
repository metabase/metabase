import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import { setupEnterpriseTest } from "__support__/enterprise";
import MetabaseSettings from "metabase/lib/settings";
import Question from "metabase-lib/lib/Question";
import { QuestionInfoSidebar } from "./QuestionInfoSidebar";

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

function mockCachingSettings({ enabled = true } = {}) {
  const original = MetabaseSettings.get.bind(MetabaseSettings);
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    const settings = {
      "enable-query-caching": enabled,
      "query-caching-min-ttl": 10000,
      "application-name": "Metabase Test",
      version: { tag: "" },
      "is-hosted?": false,
      "enable-enhancements?": false,
    };
    return settings[key] ?? original(key);
  });
}

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

function setup({ question, cachingEnabled = true } = {}) {
  mockCachingSettings({
    enabled: cachingEnabled,
  });

  const onSave = jest.fn();

  return renderWithProviders(
    <QuestionInfoSidebar question={question} onSave={onSave} />,
    {
      withSampleDatabase: true,
    },
  );
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

  describe("cache ttl field", () => {
    describe("oss", () => {
      it("is not shown", () => {
        setup({ question: getQuestion() });
        expect(
          screen.queryByText("Cache Configuration"),
        ).not.toBeInTheDocument();
      });
    });

    describe("ee", () => {
      beforeEach(() => {
        setupEnterpriseTest();
      });

      it("is shown if caching is enabled", () => {
        setup({ question: getQuestion({ cache_ttl: 2 }) });
        expect(screen.queryByText("Cache Configuration")).toBeInTheDocument();
      });

      it("is hidden if caching is disabled", () => {
        setup({ question: getQuestion(), cachingEnabled: false });
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

    it("should not show verification badge if unverified", () => {
      setup({ question: getQuestion({ moderation_reviews: [] }) });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });

    it("should show verification badge if verified", () => {
      setup({ question: getQuestion() });
      expect(screen.queryByText(/verified this/)).toBeInTheDocument();
    });
  });

  describe("read-only permissions", () => {
    it("should disable input field for description", () => {
      setup({
        question: getQuestion({ description: "Foo bar", can_write: false }),
      });
      expect(screen.queryByPlaceholderText("Add description")).toHaveValue(
        "Foo bar",
      );
      expect(screen.queryByPlaceholderText("Add description")).toBeDisabled();
    });

    it("should display 'No description' if description is null and user does not have write permissions", () => {
      setup({
        question: getQuestion({ description: null, can_write: false }),
      });
      expect(
        screen.queryByPlaceholderText("No description"),
      ).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("No description")).toBeDisabled();
    });
  });
});
