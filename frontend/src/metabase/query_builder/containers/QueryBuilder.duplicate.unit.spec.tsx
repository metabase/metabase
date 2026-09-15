import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { CreateCardRequest } from "metabase-types/api";

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

  it("does not mark an edited question saved as a new one as a copy", async () => {
    await setupQuestion();

    await triggerVisualizationQueryChange();
    await saveAsNewQuestion();

    expect(getCreatedCard()).not.toHaveProperty("source_card_id");
  });
});
