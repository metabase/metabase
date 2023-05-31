import { Route } from "react-router";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { getMetadata } from "metabase/selectors/metadata";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";

import {
  createMockCard,
  createMockModerationReview,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionInfoSidebar } from "./QuestionInfoSidebar";

const VERIFIED_REVIEW = createMockModerationReview({ status: "verified" });

function getQuestionCard(params) {
  return createMockCard({
    moderation_reviews: [VERIFIED_REVIEW],
    ...params,
  });
}

function getModelCard(params) {
  return createMockCard({
    moderation_reviews: [VERIFIED_REVIEW],
    ...params,
    dataset: true,
  });
}

async function setup({ card, cachingEnabled = true } = {}) {
  const onSave = jest.fn();

  const db = createSampleDatabase();
  const user = createMockUser();

  const settings = mockSettings({
    "enable-query-caching": cachingEnabled,
    "query-caching-min-ttl": 10000,
  });

  const storeInitialState = createMockState({
    settings,
    currentUser: user,
    entities: createMockEntitiesState({
      databases: [db],
      questions: [card],
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const question = metadata.question(card.id);

  fetchMock
    .get(`path:/api/card/${card.id}`, card)
    .get(
      { url: `path:/api/revision`, query: { entity: "card", id: card.id } },
      [],
    )
    .get("path:/api/user", [user])
    .get(`path:/api/user/${user.id}`, user);

  function WrappedQuestionInfoSidebar() {
    return <QuestionInfoSidebar question={question} onSave={onSave} />;
  }

  renderWithProviders(
    <Route path="*" component={WrappedQuestionInfoSidebar} />,
    {
      withRouter: true,
      storeInitialState,
    },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));

  return { question };
}

describe("QuestionInfoSidebar", () => {
  describe("common features", () => {
    [
      { type: "Saved Question", getObject: getQuestionCard },
      { type: "Model", getObject: getModelCard },
    ].forEach(testCase => {
      const { type, getObject } = testCase;

      describe(type, () => {
        it("displays description", async () => {
          await setup({ card: getObject({ description: "Foo bar" }) });
          expect(screen.getByText("Foo bar")).toBeInTheDocument();
        });
      });
    });
  });

  describe("cache ttl field", () => {
    describe("oss", () => {
      it("is not shown", async () => {
        await setup({ card: getQuestionCard() });
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
        await setup({ card: getQuestionCard({ cache_ttl: 2 }) });
        expect(screen.getByText("Cache Configuration")).toBeInTheDocument();
      });

      it("is hidden if caching is disabled", async () => {
        await setup({ card: getQuestionCard(), cachingEnabled: false });
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
      await setup({ card: getQuestionCard({ moderation_reviews: [] }) });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });

    it("should show verification badge if verified", async () => {
      await setup({ card: getQuestionCard() });
      expect(screen.getByText(/verified this/)).toBeInTheDocument();
    });
  });

  describe("model detail link", () => {
    it("is shown for models", async () => {
      const { question: model } = await setup({ card: getModelCard() });

      const link = screen.getByText("Model details");

      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", `${model.getUrl()}/detail`);
    });

    it("isn't shown for questions", async () => {
      await setup({ card: getQuestionCard() });
      expect(screen.queryByText("Model details")).not.toBeInTheDocument();
    });
  });

  describe("read-only permissions", () => {
    it("should disable input field for description", async () => {
      await setup({
        card: getQuestionCard({ description: "Foo bar", can_write: false }),
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
        card: getQuestionCard({ description: null, can_write: false }),
      });
      expect(screen.getByPlaceholderText("No description")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("No description")).toBeDisabled();
    });
  });
});
