import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardsEndpoints } from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Card, CreateCardRequest } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import {
  TEST_STRUCTURED_CARD,
  TEST_UNSAVED_STRUCTURED_CARD,
  setup,
  triggerVisualizationQueryChange,
  waitForSaveToBeEnabled,
} from "./test-utils";

registerVisualizations();

const setupQuestion = async () => {
  setupListNotificationEndpoints({ card_id: TEST_STRUCTURED_CARD.id }, []);
  await setup({ card: TEST_STRUCTURED_CARD });
};

const getCreatedCard = (): CreateCardRequest => {
  const body = checkNotNull(
    fetchMock.callHistory.lastCall("path:/api/card", { method: "POST" })
      ?.options.body,
  );
  return JSON.parse(body.toString());
};

const duplicateQuestion = async () => {
  await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Duplicate/ }),
  );

  const modal = await screen.findByRole("dialog", { name: /Duplicate/ });
  await userEvent.click(
    within(modal).getByRole("button", { name: "Duplicate" }),
  );
  await waitFor(() => expect(modal).not.toBeInTheDocument());
};

const saveAsNewQuestion = async () => {
  await waitForSaveToBeEnabled();
  await userEvent.click(screen.getByText("Save"));

  const modal = await screen.findByTestId("save-question-modal");
  await userEvent.click(within(modal).getByText("Save as new question"));
  await userEvent.click(within(modal).getByText("Save"));
  await waitFor(() => expect(modal).not.toBeInTheDocument());
};

describe("QueryBuilder > saving a question based on another one", () => {
  it("marks a duplicate as a copy of the question it came from", async () => {
    await setupQuestion();

    await duplicateQuestion();

    expect(getCreatedCard().source_card_id).toBe(TEST_STRUCTURED_CARD.id);
  });

  it("marks an edited question saved as a new one as a copy of the original", async () => {
    await setupQuestion();

    await triggerVisualizationQueryChange();
    await saveAsNewQuestion();

    expect(getCreatedCard().source_card_id).toBe(TEST_STRUCTURED_CARD.id);
  });
});

describe("QueryBuilder > saving changes to a question in a data app's collection", () => {
  const appCard = createMockCard({
    ...TEST_STRUCTURED_CARD,
    collection: createMockCollection({ namespace: "data-apps" }),
  });

  const setupAppQuestion = async (card: Card) => {
    setupListNotificationEndpoints({ card_id: card.id }, []);
    await setup({ card });
  };

  it("can only replace the original question", async () => {
    await setupAppQuestion(appCard);

    await triggerVisualizationQueryChange();
    await waitForSaveToBeEnabled();
    await userEvent.click(screen.getByText("Save"));

    const modal = await screen.findByTestId("save-question-modal");
    expect(
      within(modal).getByText(`Replace original question, "${appCard.name}"`),
    ).toBeInTheDocument();
    expect(
      within(modal).queryByText("Save as new question"),
    ).not.toBeInTheDocument();
  });

  it("can't be saved by someone who can't replace it", async () => {
    await setupAppQuestion({ ...appCard, can_write: false });

    await triggerVisualizationQueryChange();

    expect(await screen.findByTestId("filter-pill")).toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  describe("a question started from one of its cards, as a drill-through starts it", () => {
    const setupStartedFrom = async (original: Card) => {
      setupCardsEndpoints([original]);
      await setup({
        card: {
          ...TEST_UNSAVED_STRUCTURED_CARD,
          original_card_id: original.id,
        },
      });
    };

    it("can't be saved when it started from a metric, which a question can't replace", async () => {
      await setupStartedFrom(
        createMockCard({
          ...appCard,
          name: "App metric",
          type: "metric",
          dataset_query: createMockStructuredDatasetQuery({
            database: SAMPLE_DB_ID,
            query: createMockStructuredQuery({
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
            }),
          }),
        }),
      );

      expect(await screen.findByText("Filter")).toBeInTheDocument();
      expect(screen.queryByText("Save")).not.toBeInTheDocument();
    });

    it("can't be saved by someone who can't replace the card", async () => {
      await setupStartedFrom({ ...appCard, can_write: false });

      expect(await screen.findByText("Filter")).toBeInTheDocument();
      expect(screen.queryByText("Save")).not.toBeInTheDocument();
    });

    it("can only replace the card it started from", async () => {
      await setupStartedFrom(appCard);

      await waitForSaveToBeEnabled();
      await userEvent.click(screen.getByText("Save"));

      const modal = await screen.findByTestId("save-question-modal");
      expect(
        within(modal).getByText(`Replace original question, "${appCard.name}"`),
      ).toBeInTheDocument();
      expect(
        within(modal).queryByText("Save as new question"),
      ).not.toBeInTheDocument();
    });
  });
});
