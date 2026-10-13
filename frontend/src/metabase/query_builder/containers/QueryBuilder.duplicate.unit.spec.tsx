import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Card, CreateCardRequest } from "metabase-types/api";
import { createMockCard, createMockCollection } from "metabase-types/api/mocks";

import {
  TEST_STRUCTURED_CARD,
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
});
